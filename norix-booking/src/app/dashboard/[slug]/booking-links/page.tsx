"use client";

import { useCallback, useEffect, useState } from "react";
import type { Experience } from "@/lib/types";
import { cedi } from "@/lib/format";
import { WEEKDAYS, useDash } from "../../ctx";

type Form = Omit<Experience, "id"> & { id?: string };
const blank = (sort: number): Form => ({
  slug: "", name: "", description: "", duration_min: null, min_party: 1, max_party: 8, area_ids: [], weekdays: [], sitting_names: [],
  deposit_fixed: 0, deposit_per_guest: 0, requires_confirmation: null, active: true, sort,
});
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** cal.com "Event types / Links": different things guests can book, each with its own link and rules */
export default function BookingLinks() {
  const { sb, business, areas, isManager, toast } = useDash();
  const [rows, setRows] = useState<Experience[]>([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Form | null>(null);
  const [err, setErr] = useState("");
  const [origin, setOrigin] = useState("");
  const base = (business.settings.app_url || origin).replace(/\/$/, "");
  const sittingNames = [...new Set(Object.values(business.settings.weekly ?? {}).flat().map((s) => s.name).concat((business.settings.sittings ?? []).map((s) => s.name)))];

  const load = useCallback(async () => {
    const { data } = await sb.from("experiences").select("*").eq("business_id", business.id).order("sort");
    setRows((data ?? []) as Experience[]);
  }, [sb, business.id]);
  useEffect(() => { load(); setOrigin(window.location.origin); }, [load]);

  async function toggle(e: Experience) {
    const { error } = await sb.from("experiences").update({ active: !e.active }).eq("id", e.id);
    if (error) { toast(error.message); return; }
    toast(e.active ? `${e.name} is hidden` : `${e.name} is live`); load();
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast("Link copied"); } catch { toast(text); }
  }
  async function duplicate(e: Experience) {
    const { id, ...rest } = e; void id;
    let slug = `${e.slug}-copy`; let n = 2;
    while (rows.some((r) => r.slug === slug)) slug = `${e.slug}-copy-${n++}`;
    const { error } = await sb.from("experiences").insert({ ...rest, slug, name: `${e.name} (copy)`, active: false, sort: rows.length + 1, business_id: business.id });
    if (error) { toast(error.message); return; }
    toast("Duplicated. It starts hidden."); load();
  }
  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) { setErr("Give it a name."); return; }
    const slug = slugify(edit.slug || edit.name);
    if (slug.length < 2 || ["3d", "host", "manage", "pay", "dashboard"].includes(slug)) { setErr("Choose a different link name."); return; }
    if (edit.min_party > edit.max_party) { setErr("Smallest party can’t be bigger than the largest."); return; }
    const row = {
      business_id: business.id, slug, name: edit.name.trim(), description: edit.description?.trim() || null,
      duration_min: edit.duration_min || null, min_party: edit.min_party, max_party: edit.max_party, area_ids: edit.area_ids,
      weekdays: edit.weekdays, sitting_names: edit.sitting_names, deposit_fixed: edit.deposit_fixed || 0,
      deposit_per_guest: edit.deposit_per_guest || 0, requires_confirmation: edit.requires_confirmation, active: edit.active, sort: edit.sort,
    };
    const { error } = edit.id ? await sb.from("experiences").update(row).eq("id", edit.id) : await sb.from("experiences").insert(row);
    if (error) { setErr(error.message.includes("duplicate") ? "Another booking link already uses that link name." : error.message); return; }
    setEdit(null); setErr(""); toast("Booking link saved"); load();
  }
  async function remove() {
    if (!edit?.id) return;
    const { error } = await sb.from("experiences").delete().eq("id", edit.id);
    if (error) { setErr(error.message); return; }
    setEdit(null); toast("Booking link deleted. Past bookings are kept."); load();
  }

  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.slug.includes(q.toLowerCase()));
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const depositText = (e: Experience) => e.deposit_fixed > 0 ? `${cedi(e.deposit_fixed)} deposit` : e.deposit_per_guest > 0 ? `${cedi(e.deposit_per_guest)} per guest` : "";

  return (
    <>
      <div className="dash-head">
        <div><h1>Booking links</h1><p>Different ways to book, each with its own link: dinner, birthdays, private dining, brunch.</p></div>
        <div className="row">
          <input className="inp" style={{ maxWidth: 220 }} placeholder="Search" aria-label="Search booking links" value={q} onChange={(e) => setQ(e.target.value)} />
          {isManager && <button className="btn" onClick={() => { setEdit(blank(rows.length + 1)); setErr(""); }}>New</button>}
        </div>
      </div>

      <div className="card">
        {!shown.length ? <div className="empty">No booking links yet.</div> : shown.map((e) => {
          const url = `${base}/${business.slug}/${e.slug}`;
          const meta = [
            e.duration_min ? `${e.duration_min}m` : `${business.settings.seat_minutes ?? 90}m`,
            `${e.min_party}–${e.max_party} guests`,
            e.weekdays.length ? e.weekdays.map((d) => WEEKDAYS[d].slice(0, 3)).join(", ") : "",
            e.sitting_names.length ? e.sitting_names.join(", ") : "",
            depositText(e),
            (e.requires_confirmation ?? business.settings.requires_confirmation) ? "Needs confirming" : "",
          ].filter(Boolean);
          return (
            <div key={e.id} className="card-b" style={{ borderBottom: "1px solid var(--line)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 320px", cursor: isManager ? "pointer" : "default" }} onClick={() => { if (isManager) { setEdit({ ...e }); setErr(""); } }}>
                <div><b>{e.name}</b> <span className="muted">/{business.slug}/{e.slug}</span>{!e.active && <span className="pill" style={{ marginLeft: 8 }}>Hidden</span>}</div>
                {e.description && <div className="muted">{e.description}</div>}
                <div className="chips" style={{ marginTop: 6 }}>{meta.map((m) => <span key={m} className="pill">{m}</span>)}</div>
              </div>
              <div className="row">
                <label className="check" title={e.active ? "Live" : "Hidden"}><input type="checkbox" disabled={!isManager} checked={e.active} onChange={() => toggle(e)} aria-label={`Show ${e.name} to guests`} />{e.active ? "Live" : "Hidden"}</label>
                <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer">Open</a>
                <button className="btn ghost sm" onClick={() => copy(url)}>Copy link</button>
                <button className="btn ghost sm" onClick={() => copy(`<iframe src="${url}?embed=1" style="width:100%;height:900px;border:0" title="${e.name}" loading="lazy"></iframe>`)}>Copy embed</button>
                {isManager && <button className="btn ghost sm" onClick={() => duplicate(e)}>Duplicate</button>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ margin: 0 }}>The main booking page <b>/{business.slug}</b> lets guests choose between all live booking links. Each link above opens straight to that one.</p>

      {edit && (
        <div className="drawer-bg" onClick={(ev) => { if (ev.target === ev.currentTarget) setEdit(null); }}>
          <aside className="drawer" role="dialog" aria-label="Booking link">
            <div className="drawer-h"><h2>{edit.id ? `Edit ${edit.name}` : "New booking link"}</h2><button className="btn ghost sm" onClick={() => setEdit(null)}>Close</button></div>
            <div className="drawer-b">
              <div className="fgrid">
                <div className="f"><label htmlFor="x-name">Name</label><input id="x-name" value={edit.name} placeholder="Birthday table" onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} /></div>
                <div className="f"><label htmlFor="x-slug">Link</label><input id="x-slug" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} /><small>/{business.slug}/{edit.slug || "…"}</small></div>
              </div>
              <div className="f"><label htmlFor="x-desc">What guests see</label><textarea id="x-desc" rows={2} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className="fgrid3">
                <div className="f"><label htmlFor="x-dur">Table time (minutes)</label><input id="x-dur" type="number" min={15} max={600} placeholder={String(business.settings.seat_minutes ?? 90)} value={edit.duration_min ?? ""} onChange={(e) => setEdit({ ...edit, duration_min: e.target.value ? Number(e.target.value) : null })} /><small>Empty = your usual table time</small></div>
                <div className="f"><label htmlFor="x-min">Smallest party</label><input id="x-min" type="number" min={1} value={edit.min_party} onChange={(e) => setEdit({ ...edit, min_party: Number(e.target.value) })} /></div>
                <div className="f"><label htmlFor="x-max">Largest party online</label><input id="x-max" type="number" min={1} max={60} value={edit.max_party} onChange={(e) => setEdit({ ...edit, max_party: Number(e.target.value) })} /></div>
              </div>
              <div className="f"><label>Areas guests can choose</label>
                <div className="chips">{areas.map((a) => <button key={a.id} className="chip" aria-pressed={edit.area_ids.includes(a.id)} onClick={() => setEdit({ ...edit, area_ids: toggleIn(edit.area_ids, a.id) })}>{a.name}</button>)}</div>
                <small>None selected = every area</small></div>
              <div className="f"><label>Days</label>
                <div className="chips">{[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} className="chip" aria-pressed={edit.weekdays.includes(d)} onClick={() => setEdit({ ...edit, weekdays: toggleIn(edit.weekdays, d) })}>{WEEKDAYS[d].slice(0, 3)}</button>)}</div>
                <small>None selected = every day you’re open</small></div>
              {sittingNames.length > 0 && (
                <div className="f"><label>Seatings</label>
                  <div className="chips">{sittingNames.map((n) => <button key={n} className="chip" aria-pressed={edit.sitting_names.includes(n)} onClick={() => setEdit({ ...edit, sitting_names: toggleIn(edit.sitting_names, n) })}>{n}</button>)}</div>
                  <small>None selected = all seatings</small></div>
              )}
              <div className="fgrid">
                <div className="f"><label htmlFor="x-dfix">Deposit per booking (GH₵)</label><input id="x-dfix" type="number" min={0} value={edit.deposit_fixed} onChange={(e) => setEdit({ ...edit, deposit_fixed: Number(e.target.value) })} /></div>
                <div className="f"><label htmlFor="x-dpg">Or deposit per guest (GH₵)</label><input id="x-dpg" type="number" min={0} value={edit.deposit_per_guest} onChange={(e) => setEdit({ ...edit, deposit_per_guest: Number(e.target.value) })} /></div>
              </div>
              <small className="muted">Both 0 = the area and group deposit rules apply instead.</small>
              <div className="f"><label htmlFor="x-conf">Staff must confirm bookings</label>
                <select id="x-conf" value={edit.requires_confirmation === null ? "inherit" : edit.requires_confirmation ? "yes" : "no"}
                  onChange={(e) => setEdit({ ...edit, requires_confirmation: e.target.value === "inherit" ? null : e.target.value === "yes" })}>
                  <option value="inherit">Same as the restaurant setting</option><option value="yes">Yes, always</option><option value="no">No, confirm instantly</option>
                </select></div>
              <div className="fgrid">
                <div className="f"><label htmlFor="x-sort">Order on the booking page</label><input id="x-sort" type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></div>
                <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Live for guests</label>
              </div>
              {err && <div className="notice err">{err}</div>}
              <div className="row between">
                {edit.id ? <button className="btn danger" onClick={remove}>Delete</button> : <span />}
                <button className="btn" onClick={save}>Save booking link</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
