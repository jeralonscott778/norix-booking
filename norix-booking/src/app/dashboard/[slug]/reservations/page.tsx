"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Reservation } from "@/lib/types";
import { addDays, dateKeyIn, fromKey, timeIn, todayIn } from "@/lib/format";
import { SOURCE_LABEL, STATUS_LABEL, useDash } from "../../ctx";
import ReservationDrawer from "../reservation-drawer";
import NewReservation from "../new-reservation";

type Tab = "upcoming" | "action" | "past" | "cancelled" | "all";

/** cal.com "Bookings": upcoming, unconfirmed, past, cancelled — for a restaurant */
export default function Reservations() {
  const { sb, business, tables } = useDash();
  const tz = business.timezone || "Africa/Accra";
  const today = useMemo(() => todayIn(tz), [tz]);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [rows, setRows] = useState<Reservation[]>([]);
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [open, setOpen] = useState<Reservation | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = sb.from("reservations").select("*").eq("business_id", business.id);
    const nowIso = fromKey(today).toISOString();
    if (date) query = query.gte("starts_at", fromKey(addDays(date, -1)).toISOString()).lt("starts_at", fromKey(addDays(date, 2)).toISOString());
    else if (tab === "upcoming" || tab === "action") query = query.gte("starts_at", nowIso);
    else if (tab === "past") query = query.lt("starts_at", nowIso).gte("starts_at", fromKey(addDays(today, -120)).toISOString());
    const { data } = await query.order("starts_at", { ascending: tab !== "past" && tab !== "cancelled" }).limit(500);
    setRows((data ?? []) as Reservation[]);
    setLoading(false);
  }, [sb, business.id, tab, date, today]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = sb.channel(`res-${business.id}`).on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `business_id=eq.${business.id}` }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, business.id, load]);

  const inTab = (r: Reservation) => {
    if (date && dateKeyIn(r.starts_at, tz) !== date) return false;
    if (tab === "upcoming") return ["held", "booked", "pending", "seated"].includes(r.status);
    if (tab === "action") return ["pending", "waitlist", "request"].includes(r.status) || ["refund_due", "paid_late"].includes(r.payment_status);
    if (tab === "past") return !["cancelled", "declined"].includes(r.status);
    if (tab === "cancelled") return ["cancelled", "declined"].includes(r.status);
    return true;
  };
  const needle = q.trim().toLowerCase().replace(/^0/, "");
  const shown = rows.filter(inTab).filter((r) => !needle || r.guest_name.toLowerCase().includes(needle) || r.guest_phone.includes(needle.replace(/\D/g, "") || "§") || r.ref.toLowerCase().includes(needle));
  const counts = { action: rows.filter((r) => ["pending", "waitlist", "request"].includes(r.status) || ["refund_due", "paid_late"].includes(r.payment_status)).length };
  const tableLabel = (id: string | null) => tables.find((t) => t.id === id)?.label ?? "—";

  return (
    <>
      <div className="dash-head">
        <div><h1>Reservations</h1><p>Every booking from the website, phone, WhatsApp and walk-ins.</p></div>
        <button className="btn" onClick={() => setAdding(true)}>New reservation</button>
      </div>

      <div className="card">
        <div className="tabs" role="group" aria-label="Filter">
          {([["upcoming", "Upcoming"], ["action", "Needs action"], ["past", "Past"], ["cancelled", "Cancelled"], ["all", "All"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}{k === "action" && counts.action > 0 && <span>{counts.action}</span>}</button>
          ))}
        </div>
        <div className="card-b">
          <div className="row">
            <input className="inp" style={{ maxWidth: 280 }} placeholder="Search name, phone or reference" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            <input className="inp" style={{ maxWidth: 170 }} type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
            {date && <button className="btn ghost sm" onClick={() => setDate("")}>Clear date</button>}
            <span className="muted">{shown.length} shown</span>
          </div>
        </div>
        {loading ? <div className="empty">Loading…</div> : !shown.length ? <div className="empty">No reservations here.</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>When</th><th>Guest</th><th>Party</th><th>Table</th><th>Status</th><th>Source</th><th>Notes</th></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const st = STATUS_LABEL[r.status];
                  const k = dateKeyIn(r.starts_at, tz);
                  return (
                    <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{k === today ? "Today" : fromKey(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}<br /><span className="muted">{timeIn(r.starts_at, tz)}</span></td>
                      <td>{r.guest_name}<br /><span className="muted">+233 {r.guest_phone}</span></td>
                      <td className="num">{r.party_size}</td>
                      <td>{tableLabel(r.table_id)}</td>
                      <td><span className={`pill ${st[0]}`}>{st[1]}</span>{Number(r.deposit_ghs) > 0 && <><br /><span className={`pill ${["paid", "test_paid"].includes(r.payment_status) ? "ok" : ["refund_due", "paid_late"].includes(r.payment_status) ? "bad" : ""}`} style={{ marginTop: 4 }}>{r.payment_status === "refund_due" ? "Refund due" : r.payment_status === "refunded" ? "Refunded" : ["paid", "test_paid"].includes(r.payment_status) ? `Paid GH₵${r.deposit_ghs}` : r.payment_status === "awaiting" ? "Awaiting payment" : r.payment_status === "paid_late" ? "Paid late" : "Unpaid"}</span></>}</td>
                      <td className="muted">{SOURCE_LABEL[r.source] ?? r.source}</td>
                      <td className="muted" style={{ maxWidth: 220 }}>{[r.occasion, ...(r.dietary ?? []), r.high_chair ? "High chair" : "", r.notes].filter(Boolean).join(" · ").slice(0, 80)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <ReservationDrawer res={open} onClose={() => setOpen(null)} onChanged={load} />}
      {adding && <NewReservation onClose={() => setAdding(false)} onCreated={load} />}
    </>
  );
}
