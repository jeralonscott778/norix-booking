"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Guest, Reservation } from "@/lib/types";
import { dateKeyIn, fromKey, timeIn } from "@/lib/format";
import { STATUS_LABEL, useDash } from "../../ctx";
import Composer from "../composer";
import NewReservation from "../new-reservation";

type GuestRow = Guest & { reservations: Pick<Reservation, "id" | "starts_at" | "status" | "party_size" | "occasion">[] };
const TAGS = ["VIP", "Regular", "Birthday club", "Corporate", "Allergy", "Do not book"];

/** Guest book: everyone who has booked, their history, notes and tags */
export default function Guests() {
  const { sb, business, toast } = useDash();
  const tz = business.timezone || "Africa/Accra";
  const [rows, setRows] = useState<GuestRow[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<GuestRow | null>(null);
  const [bulk, setBulk] = useState(false);
  const [booking, setBooking] = useState<GuestRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb.from("guests").select("*, reservations(id,starts_at,status,party_size,occasion)").eq("business_id", business.id).order("updated_at", { ascending: false }).limit(2000);
    setRows((data ?? []) as GuestRow[]);
  }, [sb, business.id]);
  useEffect(() => { load(); }, [load]);

  const stats = (g: GuestRow) => {
    const visits = g.reservations.filter((r) => ["finished", "seated"].includes(r.status) || (r.status === "booked" && new Date(r.starts_at) < new Date()));
    const noShows = g.reservations.filter((r) => r.status === "no_show").length;
    const last = visits.map((r) => r.starts_at).sort().pop();
    const next = g.reservations.filter((r) => ["booked", "pending"].includes(r.status) && new Date(r.starts_at) > new Date()).map((r) => r.starts_at).sort()[0];
    return { visits: visits.length, noShows, last, next };
  };

  const needle = q.trim().toLowerCase().replace(/^0/, "");
  const shown = useMemo(() => rows.filter((g) =>
    (!tag || g.tags.includes(tag)) &&
    (!needle || (g.name ?? "").toLowerCase().includes(needle) || g.phone.includes(needle.replace(/\D/g, "") || "§") || (g.email ?? "").toLowerCase().includes(needle))), [rows, tag, needle]);

  return (
    <>
      <div className="dash-head">
        <div><h1>Guests</h1><p>{rows.length} guests. Everyone who books is added here automatically.</p></div>
        <button className="btn" disabled={!picked.size} onClick={() => setBulk(true)}>Message {picked.size || ""} selected</button>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="row">
            <input className="inp" style={{ maxWidth: 280 }} placeholder="Search name, phone or email" aria-label="Search guests" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="chips">
              <button className="chip" aria-pressed={!tag} onClick={() => setTag("")}>All</button>
              {TAGS.map((t) => <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? "" : t)}>{t}</button>)}
            </div>
          </div>
        </div>
        {!shown.length ? <div className="empty">No guests yet. They appear after their first booking.</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all" checked={shown.length > 0 && shown.every((g) => picked.has(g.id))} onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((g) => g.id)) : new Set())} /></th>
                <th>Guest</th><th>Visits</th><th>No-shows</th><th>Last visit</th><th>Next booking</th><th>Tags</th>
              </tr></thead>
              <tbody>
                {shown.map((g) => {
                  const s = stats(g);
                  return (
                    <tr key={g.id} className="click" onClick={() => setOpen(g)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${g.name}`} checked={picked.has(g.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(g.id); else n.delete(g.id); setPicked(n); }} /></td>
                      <td>{g.name || "—"}<br /><span className="muted">+233 {g.phone}{g.email ? ` · ${g.email}` : ""}</span></td>
                      <td className="num">{s.visits}</td>
                      <td className="num">{s.noShows ? <span className="pill bad">{s.noShows}</span> : 0}</td>
                      <td className="muted num">{s.last ? fromKey(dateKeyIn(s.last, tz)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</td>
                      <td className="muted num">{s.next ? `${fromKey(dateKeyIn(s.next, tz)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${timeIn(s.next, tz)}` : "—"}</td>
                      <td><div className="chips">{g.tags.map((t) => <span key={t} className={`pill ${t === "VIP" ? "info" : t === "Do not book" ? "bad" : ""}`}>{t}</span>)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <GuestDrawer g={open} stats={stats(open)} tz={tz} onClose={() => setOpen(null)} onSaved={() => { load(); toast("Guest saved"); }} onBook={() => { setBooking(open); setOpen(null); }} />}
      {bulk && (
        <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) setBulk(false); }}>
          <aside className="drawer" role="dialog" aria-label="Message guests">
            <div className="drawer-h"><h2>Message {picked.size} guests</h2><button className="btn ghost sm" onClick={() => setBulk(false)}>Close</button></div>
            <Composer target={{ guestIds: [...picked], label: `${picked.size} selected guests` }} onSent={() => setPicked(new Set())} />
          </aside>
        </div>
      )}
      {booking && <NewReservation onClose={() => setBooking(null)} onCreated={load} preset={{ name: booking.name ?? "", phone: booking.phone, email: booking.email ?? "" }} />}
    </>
  );
}

function GuestDrawer({ g, stats, tz, onClose, onSaved, onBook }: {
  g: GuestRow; stats: { visits: number; noShows: number }; tz: string; onClose: () => void; onSaved: () => void; onBook: () => void;
}) {
  const { sb } = useDash();
  const [f, setF] = useState({ name: g.name ?? "", email: g.email ?? "", notes: g.notes ?? "", tags: g.tags, opt: g.marketing_opt_in });
  const [err, setErr] = useState("");
  async function save() {
    const { error } = await sb.from("guests").update({ name: f.name.trim() || null, email: f.email.trim() || null, notes: f.notes.trim() || null, tags: f.tags, marketing_opt_in: f.opt }).eq("id", g.id);
    if (error) setErr(error.message); else onSaved();
  }
  const history = [...g.reservations].sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
  return (
    <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label={`Guest ${g.name}`}>
        <div className="drawer-h">
          <div><h2>{g.name || "Guest"}</h2><div className="muted">+233 {g.phone} · {stats.visits} visits · {stats.noShows} no-shows</div></div>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-b">
          <div className="row"><button className="btn" onClick={onBook}>Book for this guest</button></div>
          <div className="fgrid">
            <div className="f"><label htmlFor="g-name">Name</label><input id="g-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="f"><label htmlFor="g-email">Email</label><input id="g-email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          </div>
          <div className="f"><label>Tags</label>
            <div className="chips">{TAGS.map((t) => <button key={t} className="chip" aria-pressed={f.tags.includes(t)} onClick={() => setF({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] })}>{t}</button>)}</div>
          </div>
          <div className="f"><label htmlFor="g-notes">Notes (staff only)</label><textarea id="g-notes" rows={3} placeholder="Likes the corner table, allergic to groundnuts…" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <label className="check"><input type="checkbox" checked={f.opt} onChange={(e) => setF({ ...f, opt: e.target.checked })} />Happy to receive offers and news</label>
          {err && <div className="notice err">{err}</div>}
          <div className="row end"><button className="btn" onClick={save}>Save guest</button></div>

          <div className="card"><div className="card-h"><b>Message {g.name?.split(" ")[0] || "guest"}</b></div>
            <Composer target={{ guestIds: [g.id], label: g.name || `+233 ${g.phone}` }} />
          </div>

          <div><b>Booking history</b>
            <div className="tbl-wrap"><table className="tbl"><tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td className="num">{fromKey(dateKeyIn(r.starts_at, tz)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, {timeIn(r.starts_at, tz)}</td>
                  <td>{r.party_size} guests</td>
                  <td>{r.occasion ?? ""}</td>
                  <td><span className={`pill ${STATUS_LABEL[r.status][0]}`}>{STATUS_LABEL[r.status][1]}</span></td>
                </tr>
              ))}
            </tbody></table></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
