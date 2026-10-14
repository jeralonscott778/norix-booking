"use client";

import { useState } from "react";
import { todayIn } from "@/lib/format";
import { useDash } from "../ctx";

/** Staff add a phone, WhatsApp or walk-in reservation */
export default function NewReservation({ onClose, onCreated, preset }: { onClose: () => void; onCreated: () => void; preset?: { name?: string; phone?: string; email?: string } }) {
  const { sb, business, areas, tables, toast } = useDash();
  const tz = business.timezone || "Africa/Accra";
  const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [f, setF] = useState({
    source: "phone", day: todayIn(tz), time: "19:00", party: "2", area_id: "", table_id: "",
    name: preset?.name ?? "", phone: preset?.phone ? "0" + preset.phone : "", email: preset?.email ?? "", occasion: "", notes: "", internal: "", force: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setBusy(true); setErr("");
    const walkIn = f.source === "walk_in";
    const { error } = await sb.rpc("staff_create_booking", {
      p_business: business.id,
      p: {
        day: f.day, time: walkIn ? roundTime(nowTime) : f.time, party: Number(f.party), area_id: f.area_id || null, table_id: f.table_id || null,
        name: f.name, phone: f.phone, email: f.email, occasion: f.occasion, notes: f.notes, internal_notes: f.internal,
        source: f.source, force: f.force, status: walkIn ? "seated" : "booked",
      },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    toast(walkIn ? "Walk-in seated" : "Reservation added");
    onCreated(); onClose();
  }

  return (
    <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label="New reservation">
        <div className="drawer-h"><h2>New reservation</h2><button className="btn ghost sm" onClick={onClose}>Close</button></div>
        <div className="drawer-b">
          <div className="f"><label>How did it come in?</label>
            <div className="chips">
              {[["phone", "Phone call"], ["whatsapp", "WhatsApp"], ["walk_in", "Walk-in (seat now)"], ["instagram", "Instagram"]].map(([k, l]) => (
                <button key={k} className="chip" aria-pressed={f.source === k} onClick={() => setF({ ...f, source: k, day: k === "walk_in" ? todayIn(tz) : f.day })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="fgrid3">
            <div className="f"><label htmlFor="n-day">Date</label><input id="n-day" type="date" value={f.day} disabled={f.source === "walk_in"} onChange={(e) => setF({ ...f, day: e.target.value })} /></div>
            <div className="f"><label htmlFor="n-time">Time</label><input id="n-time" type="time" step={900} value={f.source === "walk_in" ? roundTime(nowTime) : f.time} disabled={f.source === "walk_in"} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
            <div className="f"><label htmlFor="n-party">Guests</label><input id="n-party" type="number" min={1} max={60} value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} /></div>
          </div>
          <div className="fgrid">
            <div className="f"><label htmlFor="n-area">Area</label>
              <select id="n-area" value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value, table_id: "" })}>
                <option value="">Any area</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="f"><label htmlFor="n-table">Table</label>
              <select id="n-table" value={f.table_id} onChange={(e) => setF({ ...f, table_id: e.target.value })}>
                <option value="">Pick the best free table</option>
                {tables.filter((t) => !f.area_id || t.area_id === f.area_id).map((t) => <option key={t.id} value={t.id}>{t.label} · {t.seats} seats</option>)}
              </select>
            </div>
          </div>
          <div className="fgrid">
            <div className="f"><label htmlFor="n-name">Guest name</label><input id="n-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="f"><label htmlFor="n-phone">Phone</label><input id="n-phone" inputMode="tel" placeholder="024 123 4567" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="f"><label htmlFor="n-email">Email (optional)</label><input id="n-email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="f"><label htmlFor="n-occ">Occasion (optional)</label><input id="n-occ" value={f.occasion} onChange={(e) => setF({ ...f, occasion: e.target.value })} /></div>
          </div>
          <div className="f"><label htmlFor="n-notes">Guest note</label><textarea id="n-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div className="f"><label htmlFor="n-int">Staff note</label><textarea id="n-int" rows={2} value={f.internal} onChange={(e) => setF({ ...f, internal: e.target.value })} /></div>
          <label className="check"><input type="checkbox" checked={f.force} onChange={(e) => setF({ ...f, force: e.target.checked })} />Book even if it overlaps another booking (overbook)</label>
          {err && <div className="notice err">{err}</div>}
          <div className="row end">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={busy} onClick={create}>{busy ? "Saving…" : f.source === "walk_in" ? "Seat walk-in" : "Add reservation"}</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>The guest gets the usual confirmation on WhatsApp, SMS and email if those are switched on in Automations.</p>
        </div>
      </aside>
    </div>
  );
}

function roundTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const q = Math.floor(m / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(q).padStart(2, "0")}`;
}
