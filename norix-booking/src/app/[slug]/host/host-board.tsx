"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Area, Business, DiningTable, Reservation } from "@/lib/types";
import { addDays, cedi, dateKeyIn, fromKey, timeIn, todayIn } from "@/lib/format";

type Props = { business: Business; areas: Area[]; initialTables: DiningTable[]; userEmail: string };

const STATUS: Record<Reservation["status"], [string, string]> = {
  booked: ["info", "Booked"], seated: ["warn", "Seated"], finished: ["", "Finished"], no_show: ["bad", "No-show"],
  cancelled: ["", "Cancelled"], waitlist: ["warn", "Waitlist"], request: ["warn", "Group request"],
};
const SOURCE: Record<string, string> = { web: "Website", ai_receptionist: "AI receptionist", whatsapp: "WhatsApp", phone: "Phone", walk_in: "Walk-in" };

export default function HostBoard({ business: b, areas, initialTables, userEmail }: Props) {
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);
  const tz = b.timezone || "Africa/Accra";
  const today = useMemo(() => todayIn(tz), [tz]);
  const [day, setDay] = useState(today);
  const [res, setRes] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<DiningTable[]>(initialTables);
  const [live, setLive] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [busyId, setBusyId] = useState("");
  const [, setTick] = useState(0);
  const audio = useRef<AudioContext | null>(null);

  const load = useCallback(async () => {
    const from = new Date(fromKey(addDays(day, -1)).getTime()).toISOString();
    const to = new Date(fromKey(addDays(day, 2)).getTime()).toISOString();
    const [{ data: r }, { data: t }] = await Promise.all([
      sb.from("reservations").select("*").eq("business_id", b.id).gte("starts_at", from).lt("starts_at", to).order("starts_at"),
      sb.from("dining_tables").select("id,label,seats,status,area_id,pos").eq("business_id", b.id).order("label"),
    ]);
    setRes(((r ?? []) as Reservation[]).filter((x) => dateKeyIn(x.starts_at, tz) === day));
    if (t) setTables(t as DiningTable[]);
  }, [sb, b.id, day, tz]);

  useEffect(() => { load(); }, [load]);

  // Live updates: new bookings and status changes arrive without refreshing
  useEffect(() => {
    const ch = sb
      .channel(`host-${b.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `business_id=eq.${b.id}` }, (p) => {
        if (p.eventType === "INSERT") {
          const r = p.new as Reservation;
          setFresh((s) => new Set(s).add(r.id));
          setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(r.id); return n; }), 6000);
          showToast(`New booking: ${r.guest_name}, ${r.party_size} guests, ${timeIn(r.starts_at, tz)}`);
          chime();
        }
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dining_tables", filter: `business_id=eq.${b.id}` }, () => load())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(() => { load(); setTick((n) => n + 1); }, 30000);
    return () => { sb.removeChannel(ch); clearInterval(poll); };
  }, [sb, b.id, load, tz]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 4000); }
  function chime() {
    const a = audio.current; if (!a) return;
    try {
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5); o.start(); o.stop(a.currentTime + 0.5);
    } catch {}
  }
  function enableSound() {
    try { audio.current ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); chime(); } catch {}
  }

  async function setStatus(r: Reservation, status: Reservation["status"]) {
    setBusyId(r.id);
    const { error } = await sb.from("reservations").update({ status }).eq("id", r.id);
    if (!error && r.table_id && (status === "seated" || status === "finished")) {
      await sb.from("dining_tables").update({ status: status === "seated" ? "seated" : "clearing" }).eq("id", r.table_id);
    }
    if (error) showToast(error.message);
    setBusyId(""); load();
  }
  async function cycleTable(t: DiningTable) {
    const order: DiningTable["status"][] = ["free", "seated", "clearing"];
    const next = order[(order.indexOf(t.status) + 1) % 3];
    const { error } = await sb.from("dining_tables").update({ status: next }).eq("id", t.id);
    if (error) showToast(error.message);
    load();
  }
  async function signOut() { await sb.auth.signOut(); router.refresh(); }

  const tableById = Object.fromEntries(tables.map((t) => [t.id, t]));
  const areaById = Object.fromEntries(areas.map((a) => [a.id, a]));
  const active = res.filter((r) => r.status !== "cancelled");
  const up = active.filter((r) => r.status === "booked");
  const seated = active.filter((r) => r.status === "seated");
  const wait = active.filter((r) => r.status === "waitlist" || r.status === "request");
  const done = active.filter((r) => r.status === "finished" || r.status === "no_show");
  const covers = active.filter((r) => ["booked", "seated", "finished"].includes(r.status)).reduce((s, r) => s + r.party_size, 0);
  const nowMin = (() => { const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number); return h * 60 + m; })();
  const minOf = (iso: string) => { const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).split(":").map(Number); return h * 60 + m; };
  const label = (k: string) => (k === today ? "Today" : fromKey(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }));

  const row = (r: Reservation) => {
    const st = STATUS[r.status];
    const t = r.table_id ? tableById[r.table_id] : null;
    const a = r.area_id ? areaById[r.area_id] : null;
    return (
      <div key={r.id} className={`host-res${fresh.has(r.id) ? " fresh" : ""}`}>
        <div className="host-time">{timeIn(r.starts_at, tz)}</div>
        <div className="host-main">
          <div className="host-n">{r.guest_name} · {r.party_size}</div>
          <div className="host-d">{t ? `Table ${t.label} · ${a?.name ?? ""}` : a ? a.name : "No table yet"} · +233 {r.guest_phone} · {r.ref}</div>
          {r.notes && <div className="host-d">“{r.notes}”</div>}
          <div className="host-tags">
            <span className={`host-tag ${st[0]}`}>{st[1]}</span>
            {r.occasion && <span className="host-tag">{r.occasion}</span>}
            {r.dietary?.map((d) => <span key={d} className="host-tag bad">{d}</span>)}
            {r.high_chair && <span className="host-tag warn">High chair</span>}
            {Number(r.deposit_ghs) > 0 && <span className="host-tag ok">Deposit {cedi(r.deposit_ghs)}</span>}
            <span className={`host-tag${r.source === "ai_receptionist" ? " info" : ""}`}>{SOURCE[r.source] ?? r.source}</span>
          </div>
        </div>
        <div className="host-acts">
          {r.status === "booked" && <>
            <button className="host-mini primary" disabled={busyId === r.id} onClick={() => setStatus(r, "seated")}>Seat</button>
            <button className="host-mini" disabled={busyId === r.id} onClick={() => setStatus(r, "no_show")}>No-show</button>
          </>}
          {r.status === "seated" && <button className="host-mini primary" disabled={busyId === r.id} onClick={() => setStatus(r, "finished")}>Finish</button>}
          {(r.status === "waitlist" || r.status === "request") && <button className="host-mini" disabled={busyId === r.id} onClick={() => setStatus(r, "cancelled")}>Remove</button>}
        </div>
      </div>
    );
  };

  return (
    <div className="host-wrap">
      <div className="host-top">
        <div>
          <div className="host-muted">{b.name}</div>
          <h1>{day === today ? "Today’s reservations" : `Reservations for ${label(day)}`}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`host-live${live ? "" : " off"}`}><i />{live ? "Live" : "Connecting…"}</span>
          <button className="host-mini" onClick={enableSound}>{audio.current ? "Sound on" : "Turn on sound"}</button>
          <button className="host-mini" onClick={signOut} title={userEmail}>Sign out</button>
        </div>
      </div>

      <div className="host-days">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i)).map((k) => (
          <button key={k} aria-pressed={k === day} onClick={() => setDay(k)}>{label(k)}</button>
        ))}
      </div>

      <div className="host-stats">
        <div className="host-stat"><small>Reservations</small><b>{active.filter((r) => !["waitlist", "request"].includes(r.status)).length}</b></div>
        <div className="host-stat"><small>Covers</small><b>{covers}</b></div>
        <div className="host-stat"><small>Tables free now</small><b>{tables.filter((t) => t.status === "free").length} / {tables.length}</b></div>
        <div className="host-stat"><small>Waitlist + requests</small><b>{wait.length}</b></div>
      </div>

      <div className="host-grid">
        <div className="host-panel">
          <div className="host-ptitle"><b>Reservations</b><span className="host-muted">{label(day)}</span></div>
          {!active.length && <div className="host-empty">No reservations yet. New bookings from the website appear here instantly.</div>}
          {!!seated.length && <><div className="host-sect">Seated</div>{seated.map(row)}</>}
          {!!up.length && <><div className="host-sect">Coming up</div>{up.map(row)}</>}
          {!!wait.length && <><div className="host-sect">Waitlist and group requests</div>{wait.map(row)}</>}
          {!!done.length && <><div className="host-sect">Finished and no-shows</div>{done.map(row)}</>}
        </div>

        <div className="host-panel">
          <div className="host-ptitle"><b>Floor plan</b><span className="host-muted">Tap a table to change it</span></div>
          <div className="host-floor">
            {areas.map((a) => {
              const ts = tables.filter((t) => t.area_id === a.id);
              if (!ts.length) return null;
              return (
                <div className="host-zone" key={a.id}>
                  <h4>{a.name}</h4>
                  <div className="host-tables">
                    {ts.map((t) => {
                      const sit = active.find((r) => r.table_id === t.id && r.status === "seated");
                      const next = day === today
                        ? up.filter((r) => r.table_id === t.id && minOf(r.starts_at) >= nowMin - 15).sort((x, y) => (x.starts_at < y.starts_at ? -1 : 1))[0]
                        : undefined;
                      const cls = t.status !== "free" ? t.status : next && minOf(next.starts_at) - nowMin <= 90 ? "soon" : "free";
                      const sub = t.status === "seated" ? sit?.guest_name ?? "Seated" : t.status === "clearing" ? "Clearing"
                        : next ? `${timeIn(next.starts_at, tz)} · ${next.guest_name.split(" ")[0]}` : "Free";
                      return (
                        <button key={t.id} className={`host-tbl ${cls}`} onClick={() => cycleTable(t)} aria-label={`Table ${t.label}, ${t.seats} seats, ${t.status}`}>
                          <b>{t.label}</b><small>{t.seats} seats</small><small>{sub}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="host-legend">
              <span><i style={{ borderColor: "var(--ok)" }} />Free</span>
              <span><i style={{ borderColor: "var(--info)" }} />Booked within 90 min</span>
              <span><i style={{ borderColor: "var(--warn)" }} />Seated</span>
              <span><i style={{ borderStyle: "dashed", borderColor: "var(--muted)" }} />Clearing</span>
            </div>
          </div>
        </div>
      </div>
      {toast && <div className="host-toast" role="status">{toast}</div>}
    </div>
  );
}
