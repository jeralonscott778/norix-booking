"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Area, BookingResult, Business, DiningTable, Slot } from "@/lib/types";
import { addDays, fmtSlot, fromKey, isDayOpen, longDate, normalisePhone, todayIn } from "@/lib/format";
import { bookTable } from "../actions";

type Props = { business: Business; areas: Area[]; tables: DiningTable[]; initialDay?: string; initialParty: number; closedDates?: string[] };
type Free = { table_id: string; free: boolean; fits: boolean };
type Marker = { t: DiningTable; ring: THREE.Mesh; hit: THREE.Mesh };

export default function SeatView({ business: b, areas, tables, initialDay, initialParty, closedDates = [] }: Props) {
  const today = useMemo(() => todayIn(b.timezone || "Africa/Accra"), [b.timezone]);
  const openDays = useMemo(() => {
    const out: string[] = []; let k = today;
    for (let i = 0; i < 21 && out.length < 14; i++) { if (isDayOpen(b, k, today, closedDates)) out.push(k); k = addDays(k, 1); }
    return out;
  }, [b, today, closedDates]);
  const placed = useMemo(() => tables.filter((t) => typeof t.pos?.x === "number" && typeof t.pos?.z === "number"), [tables]);

  const [party, setParty] = useState(initialParty);
  const [day, setDay] = useState(initialDay && openDays.includes(initialDay) ? initialDay : openDays[0] ?? today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [free, setFree] = useState<Record<string, Free>>({});
  const [sel, setSel] = useState<DiningTable | null>(null);
  const [mode, setMode] = useState<"look" | "form" | "done">("look");
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [err, setErr] = useState("");
  const [result, setResult] = useState<BookingResult | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [pending, start] = useTransition();

  const mount = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const api = useRef<{ fly: (t: DiningTable | null, seat?: boolean) => void; paint: () => void } | null>(null);
  const state = useRef({ free, sel });
  state.current = { free, sel };

  // times for the chosen day
  useEffect(() => {
    let live = true;
    supabaseBrowser().rpc("get_availability", { p_slug: b.slug, p_day: day, p_party: party }).then(({ data }) => {
      if (!live) return;
      const list = (data ?? []) as Slot[];
      setSlots(list);
      setTime((cur) => (cur && list.some((s) => s.slot === cur) ? cur : list.find((s) => s.area_ids.length)?.slot ?? list[0]?.slot ?? null));
    });
    return () => { live = false; };
  }, [b.slug, day, party]);

  // which tables are free at that time
  const loadFree = useCallback(async () => {
    if (!time) { setFree({}); return; }
    const { data } = await supabaseBrowser().rpc("get_free_tables", { p_slug: b.slug, p_day: day, p_time: time, p_party: party });
    const map: Record<string, Free> = {};
    ((data ?? []) as Free[]).forEach((r) => { map[r.table_id] = r; });
    setFree(map);
  }, [b.slug, day, time, party]);
  useEffect(() => { loadFree(); }, [loadFree]);
  useEffect(() => { api.current?.paint(); }, [free, sel]);

  // build the 3D room once
  useEffect(() => {
    const el = mount.current, lab = labels.current;
    if (!el || !lab) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setWebgl(false); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0907);
    scene.fog = new THREE.Fog(0x0b0907, 32, 64);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 2; controls.maxDistance = 36;

    const xs = placed.map((t) => t.pos.x!), zs = placed.map((t) => t.pos.z!);
    const minX = Math.min(...xs, 0) - 3, maxX = Math.max(...xs, 0) + 3, minZ = Math.min(...zs, 0) - 3, maxZ = Math.max(...zs, 0) + 3;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, w = maxX - minX, d = maxZ - minZ;
    const overview = { pos: new THREE.Vector3(cx - 2, Math.max(w, d) * 0.85, cz + Math.max(w, d) * 0.95), target: new THREE.Vector3(cx, 0, cz) };
    camera.position.copy(overview.pos); controls.target.copy(overview.target);

    const mat = (c: number, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; scene.add(o); return o;
    };
    const accent = new THREE.Color(getComputedStyle(el).getPropertyValue("--b-accent").trim() || "#d9b26a");

    scene.add(new THREE.HemisphereLight(0xffe2b8, 0x1a120b, 0.55));
    const sun = new THREE.DirectionalLight(0xffd9a8, 0.75);
    sun.position.set(cx + 8, 18, cz + 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -w, right: w, top: d, bottom: -d });
    sun.target.position.set(cx, 0, cz); scene.add(sun, sun.target);

    const wood = mat(0x5b3b24, 0.7), wall = mat(0x2a221c, 0.95), brass = mat(0xc9a45c, 0.35, 0.8), leather = mat(0x7a3f22, 0.6), legs = mat(0x1b1410);
    add(new THREE.BoxGeometry(w, 0.2, d), wood, cx, -0.1, cz, false);
    add(new THREE.BoxGeometry(0.2, 4, d), wall, minX, 2, cz);
    add(new THREE.BoxGeometry(w, 4, 0.2), wall, cx, 2, minZ);

    // a floor patch per area, so each area reads as its own space
    const tints = [0x4a3424, 0x5f5a52, 0x3a2c22, 0x2e2621, 0x4d4036];
    areas.forEach((a, i) => {
      const ts = placed.filter((t) => t.area_id === a.id);
      if (!ts.length) return;
      const ax = ts.map((t) => t.pos.x!), az = ts.map((t) => t.pos.z!);
      const x0 = Math.min(...ax) - 1.8, x1 = Math.max(...ax) + 1.8, z0 = Math.min(...az) - 1.8, z1 = Math.max(...az) + 1.8;
      const p = add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(tints[i % tints.length], 0.9), (x0 + x1) / 2, 0.005, (z0 + z1) / 2, false);
      p.rotation.x = -Math.PI / 2;
      if (/private/i.test(a.name)) {
        add(new THREE.BoxGeometry(0.15, 2.8, z1 - z0), wall, x0, 1.4, (z0 + z1) / 2);
        add(new THREE.BoxGeometry(0.15, 2.8, z1 - z0), wall, x1, 1.4, (z0 + z1) / 2);
      }
      if (/bar/i.test(a.name)) {
        add(new THREE.BoxGeometry(x1 - x0 + 1, 1.1, 0.9), mat(0x3b3229, 0.6), (x0 + x1) / 2, 0.55, z0 + 0.2);
        add(new THREE.BoxGeometry(x1 - x0 + 1.2, 0.08, 1.1), brass, (x0 + x1) / 2, 1.14, z0 + 0.2);
      }
    });

    const chair = (x: number, z: number, rot: number) => {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), leather); seat.position.y = 0.46;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.07), leather); back.position.set(0, 0.72, -0.2);
      seat.castShadow = back.castShadow = true; g.add(seat, back);
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([a, c]) => {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), legs); l.position.set(a, 0.23, c); g.add(l);
      });
      g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
    };

    const markers: Marker[] = [];
    const tags: Record<string, HTMLDivElement> = {};
    placed.forEach((t) => {
      const x = t.pos.x!, z = t.pos.z!, shape = t.pos.shape ?? (t.seats <= 4 ? "round" : "rect");
      let r = 0.5;
      if (shape === "round") {
        r = t.seats <= 2 ? 0.45 : 0.65;
        add(new THREE.CylinderGeometry(r, r, 0.06, 32), wood, x, 0.76, z); add(new THREE.CylinderGeometry(0.06, 0.06, 0.74, 10), brass, x, 0.38, z);
        for (let i = 0; i < t.seats; i++) { const a = (i / t.seats) * Math.PI * 2 + 0.3, dd = r + 0.42; chair(x + Math.sin(a) * dd, z + Math.cos(a) * dd, a + Math.PI); }
      } else if (shape === "rect") {
        add(new THREE.BoxGeometry(1.1, 0.06, 2.1), wood, x, 0.76, z); add(new THREE.BoxGeometry(0.9, 0.72, 0.08), legs, x, 0.38, z);
        [-0.65, 0, 0.65].forEach((dz) => { chair(x - 0.85, z + dz, Math.PI / 2); chair(x + 0.85, z + dz, -Math.PI / 2); }); r = 1.25;
      } else if (shape === "long") {
        add(new THREE.BoxGeometry(4.6, 0.06, 1.2), wood, x, 0.76, z); add(new THREE.BoxGeometry(4.2, 0.72, 0.1), legs, x, 0.38, z);
        for (let i = 0; i < 6; i++) { const cx2 = x - 1.9 + i * 0.76; chair(cx2, z - 0.95, 0); chair(cx2, z + 0.95, Math.PI); }
        chair(x - 2.75, z, Math.PI / 2); chair(x + 2.75, z, -Math.PI / 2); r = 2.6;
      } else {
        [-0.45, 0.45].forEach((dx) => { add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), leather, x + dx, 0.78, z); add(new THREE.CylinderGeometry(0.04, 0.04, 0.76, 8), brass, x + dx, 0.38, z); });
        r = 0.85;
      }
      const light = new THREE.PointLight(0xffb866, 0.35, 6, 2); light.position.set(x, 3, z); scene.add(light);
      const ringGeo = shape === "long" ? new THREE.PlaneGeometry(6, 2.9) : shape === "rect" ? new THREE.PlaneGeometry(2.6, 2.9) : new THREE.CircleGeometry(r + 0.75, 40);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.28, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z); scene.add(ring);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(r + 0.6, 1), Math.max(r + 0.6, 1), 1.6, 16), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, 0.8, z); hit.userData.id = t.id; scene.add(hit);
      markers.push({ t, ring, hit });
      const tag = document.createElement("div"); tag.className = "sv-tag"; tag.textContent = t.label; lab.appendChild(tag); tags[t.id] = tag;
    });

    let fly: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; k: number } | null = null;
    const flyTo = (p: THREE.Vector3, t: THREE.Vector3) => { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, k: 0 }; };
    api.current = {
      fly(t, seat) {
        if (!t) return flyTo(overview.pos.clone(), overview.target.clone());
        const x = t.pos.x!, z = t.pos.z!;
        if (!seat) return flyTo(new THREE.Vector3(x + 4.5, 6, z + 6), new THREE.Vector3(x, 0.6, z));
        const dir = new THREE.Vector3(cx - x, 0, cz - z).normalize();
        if (!Number.isFinite(dir.x)) dir.set(1, 0, 0);
        flyTo(new THREE.Vector3(x - dir.x, 1.25, z - dir.z), new THREE.Vector3(x + dir.x * 6, 1.1, z + dir.z * 6));
      },
      paint() {
        const { free: f, sel: s } = state.current;
        markers.forEach(({ t, ring }) => {
          const ok = f[t.id]?.free && f[t.id]?.fits;
          const m = ring.material as THREE.MeshBasicMaterial;
          m.color.set(ok ? accent : new THREE.Color(0x4a4038)); m.opacity = s?.id === t.id ? 0.6 : ok ? 0.3 : 0.16;
          const tag = tags[t.id];
          tag.className = `sv-tag ${ok ? "free" : "busy"}${s?.id === t.id ? " sel" : ""}`;
          tag.textContent = t.label + (ok ? " · free" : "");
        });
      },
    };
    api.current.paint();

    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      v.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(v, camera);
      const h = ray.intersectObjects(markers.map((m) => m.hit))[0];
      if (h) { const t = placed.find((x) => x.id === h.object.userData.id)!; setSel(t); setMode("look"); setErr(""); api.current?.fly(t); }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const resize = () => { const W = el.clientWidth, H = el.clientHeight; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", resize); resize();

    const tmp = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (fly) {
        fly.k = Math.min(1, fly.k + 0.035); const e = 1 - Math.pow(1 - fly.k, 3);
        camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
        if (fly.k >= 1) fly = null;
      }
      controls.update(); renderer.render(scene, camera);
      const W = el.clientWidth, H = el.clientHeight;
      placed.forEach((t) => {
        const tag = tags[t.id]; tmp.set(t.pos.x!, 1.6, t.pos.z!).project(camera);
        if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { tag.style.display = "none"; return; }
        tag.style.display = ""; tag.style.left = `${((tmp.x + 1) / 2) * W}px`; tag.style.top = `${((1 - tmp.y) / 2) * H}px`;
      });
    };
    loop();

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); lab.innerHTML = ""; api.current = null;
    };
  }, [placed, areas]);

  const selFree = sel ? free[sel.id] : undefined;
  const selOk = !!(selFree?.free && selFree?.fits);
  const selArea = sel ? areas.find((a) => a.id === sel.area_id) : undefined;
  const freeCount = placed.filter((t) => free[t.id]?.free && free[t.id]?.fits).length;
  const why = !sel ? "" : !selFree?.fits ? (sel.seats < party ? `Seats ${sel.seats}, too small for ${party}` : `Not for groups of ${party}`) : `Booked at ${time ? fmtSlot(time) : "this time"}`;

  function book() {
    if (!sel || !time) return;
    if (form.name.trim().length < 2) return setErr("Enter the name for the booking.");
    if (!normalisePhone(form.phone)) return setErr("Enter a 9-digit Ghana number, for example 24 123 4567.");
    setErr("");
    start(async () => {
      const r = await bookTable({
        slug: b.slug, day, time, party, areaId: sel.area_id, tableId: sel.id, name: form.name.trim(), phone: form.phone,
        email: form.email.trim(), occasion: "None", dietary: [], highChair: false, notes: "Booked from the 3D seat view",
        paymentMethod: selArea && Number(selArea.deposit_ghs) > 0 ? "MTN MoMo" : null, waitlist: false,
      });
      if (!r.ok) { setErr(r.error); loadFree(); return; }
      setResult(r.result); setMode("done"); loadFree();
    });
  }

  return (
    <div className="sv">
      <div className="sv-canvas" ref={mount} />
      <div className="sv-labels" ref={labels} />
      {!webgl && <div className="sv-fallback">3D isn’t available on this device. <Link href={`/${b.slug}`}>Book from the list instead.</Link></div>}

      <div className="sv-bar">
        <Link href={`/${b.slug}`} className="sv-glass sv-brand"><b>{b.name}</b><small>3D seat view · ← back to booking</small></Link>
        <div className="sv-glass sv-ctrls">
          <div className="sv-grp"><span>Guests</span>
            <select aria-label="Guests" value={party} onChange={(e) => { setParty(+e.target.value); setSel(null); }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="sv-grp"><span>Date</span>
            <select aria-label="Date" value={day} onChange={(e) => { setDay(e.target.value); setSel(null); }}>
              {openDays.map((k) => <option key={k} value={k}>{k === today ? "Today" : fromKey(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</option>)}
            </select>
          </div>
          <div className="sv-grp"><span>Time</span>
            <select aria-label="Time" value={time ?? ""} onChange={(e) => setTime(e.target.value)}>
              {!slots.length && <option value="">No times</option>}
              {slots.map((s) => <option key={s.slot} value={s.slot}>{fmtSlot(s.slot)}{s.area_ids.length ? "" : " (full)"}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="sv-glass sv-card">
        {mode === "done" && result ? (
          <>
            <h2>{result.status === "pending" ? `Table ${result.table} requested` : `Table ${result.table} is yours`}</h2>
            <p>{longDate(day)}, {time && fmtSlot(time)} · {result.party} {result.party === 1 ? "guest" : "guests"} · {result.area}</p>
            <p>Reference <b style={{ color: "var(--b-accent)", letterSpacing: ".06em" }}>{result.ref}</b>. Your confirmation is on its way to WhatsApp.</p>
            <div className="sv-row"><button className="sv-btn ghost" onClick={() => { setMode("look"); setSel(null); setResult(null); api.current?.fly(null); }}>Look around again</button></div>
          </>
        ) : !sel ? (
          <>
            <h2>{time ? `${freeCount} tables free at ${fmtSlot(time)} for ${party}` : "No times left on this day"}</h2>
            <p>Drag to look around. Pinch or scroll to zoom. Tap a glowing table to see it up close.</p>
          </>
        ) : mode === "form" ? (
          <>
            <h2>Book table {sel.label}</h2>
            <p>{longDate(day)}, {time && fmtSlot(time)} · {party} {party === 1 ? "guest" : "guests"} · {selArea?.name}</p>
            <input aria-label="Name for the booking" placeholder="Name for the booking" value={form.name} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input aria-label="WhatsApp number" placeholder="WhatsApp number, e.g. 024 123 4567" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input aria-label="Email (optional)" placeholder="Email (optional)" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {err && <div className="sv-err" role="alert">{err}</div>}
            <div className="sv-row">
              <button className="sv-btn" disabled={pending} onClick={book}>{pending ? "Reserving…" : "Reserve this table"}</button>
              <button className="sv-btn ghost" onClick={() => { setMode("look"); setErr(""); }}>Back</button>
            </div>
          </>
        ) : (
          <>
            <h2>Table {sel.label} · {selArea?.name}</h2>
            <p>{sel.seats} seats{selArea?.description ? ` · ${selArea.description}` : ""}{selArea && Number(selArea.deposit_ghs) > 0 ? ` · GH₵ ${selArea.deposit_ghs} deposit` : ""}</p>
            {selOk ? <span className="sv-ok">Free at {time && fmtSlot(time)} for {party}</span> : <span className="sv-hint">{why}</span>}
            {err && <div className="sv-err" role="alert">{err}</div>}
            <div className="sv-row">
              <button className="sv-btn" disabled={!selOk} onClick={() => setMode("form")}>Book this table</button>
              <button className="sv-btn ghost" onClick={() => api.current?.fly(sel, true)}>View from this seat</button>
              <button className="sv-btn ghost" onClick={() => { setSel(null); api.current?.fly(null); }}>Overview</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
