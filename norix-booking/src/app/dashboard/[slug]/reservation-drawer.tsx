"use client";

import { useEffect, useState } from "react";
import type { Message, Reservation } from "@/lib/types";
import { cedi, dateKeyIn, longDate, timeIn } from "@/lib/format";
import { SOURCE_LABEL, STATUS_LABEL, callFunction, useDash } from "../ctx";
import Composer from "./composer";

/** Side panel: everything about one reservation, with every action staff need */
export default function ReservationDrawer({ res, onClose, onChanged }: { res: Reservation; onClose: () => void; onChanged: () => void }) {
  const { sb, business, areas, tables, toast } = useDash();
  const tz = business.timezone || "Africa/Accra";
  const [r, setR] = useState(res);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [expName, setExpName] = useState("");
  useEffect(() => {
    if (!res.experience_id) { setExpName(""); return; }
    sb.from("experiences").select("name").eq("id", res.experience_id).maybeSingle().then(({ data }) => setExpName((data as { name?: string } | null)?.name ?? ""));
  }, [sb, res.experience_id]);
  const [form, setForm] = useState(() => toForm(res, tz));

  useEffect(() => { setR(res); setForm(toForm(res, tz)); }, [res, tz]);
  useEffect(() => {
    sb.from("messages").select("*").eq("reservation_id", r.id).order("created_at", { ascending: false }).then(({ data }) => setMsgs((data ?? []) as Message[]));
  }, [sb, r.id, r.status]);

  async function update(patch: Partial<Reservation>, done: string) {
    setBusy(true); setErr("");
    const { data, error } = await sb.from("reservations").update(patch).eq("id", r.id).select("*").single();
    setBusy(false);
    if (error) { setErr(error.message); return false; }
    if (patch.status === "seated" && r.table_id) await sb.from("dining_tables").update({ status: "seated" }).eq("id", r.table_id);
    if (patch.status === "finished" && r.table_id) await sb.from("dining_tables").update({ status: "clearing" }).eq("id", r.table_id);
    setR(data as Reservation); toast(done); onChanged(); return true;
  }

  async function refund() {
    setBusy(true); setErr("");
    try {
      await callFunction(sb, "payments", { action: "refund", reservation_id: r.id });
      setR({ ...r, payment_status: "refunded" }); toast("Refund sent to the guest’s MoMo wallet or card"); onChanged();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function markRefunded() {
    await update({ payment_status: "refunded" } as Partial<Reservation>, "Marked as refunded");
  }

  async function saveEdit() {
    const startsAt = new Date(`${form.day}T${form.time}:00`);
    // Business timezone may differ from the browser; build the instant in the business timezone
    const offsetMin = tzOffsetMinutes(tz, startsAt);
    const iso = new Date(Date.UTC(+form.day.slice(0, 4), +form.day.slice(5, 7) - 1, +form.day.slice(8, 10), +form.time.slice(0, 2), +form.time.slice(3, 5)) - offsetMin * 60000).toISOString();
    const table = tables.find((t) => t.id === form.table_id);
    const ok = await update({
      starts_at: iso, party_size: Number(form.party), table_id: form.table_id || null, area_id: table ? table.area_id : form.area_id || null,
      guest_name: form.name.trim(), guest_phone: form.phone.replace(/\D/g, "").slice(-9), guest_email: form.email.trim() || null,
      notes: form.notes.trim() || null, internal_notes: form.internal.trim() || null, occasion: form.occasion.trim() || null,
    }, "Reservation updated");
    if (ok) setEdit(false);
  }

  const st = STATUS_LABEL[r.status];
  const table = tables.find((t) => t.id === r.table_id);
  const area = areas.find((a) => a.id === r.area_id);

  return (
    <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label={`Reservation ${r.ref}`}>
        <div className="drawer-h">
          <div>
            <h2>{r.guest_name} · {r.party_size}</h2>
            <div className="muted">{longDate(dateKeyIn(r.starts_at, tz))}, {timeIn(r.starts_at, tz)} · {r.ref}</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-b">
          <div className="row">
            <span className={`pill ${st[0]}`}>{st[1]}</span>
            <span className="pill">{SOURCE_LABEL[r.source] ?? r.source}</span>
            {r.cancelled_by && <span className="pill">Cancelled by {r.cancelled_by}</span>}
          </div>
          {err && <div className="notice err">{err}</div>}

          <div className="row">
            {r.status === "pending" && <>
              <button className="btn" disabled={busy} onClick={() => update({ status: "booked" }, "Confirmed. The guest has been told.")}>Confirm booking</button>
              <button className="btn danger" disabled={busy} onClick={() => update({ status: "declined" }, "Declined")}>Decline</button>
            </>}
            {(r.status === "waitlist" || r.status === "request") && (
              <button className="btn" disabled={busy || !form.table_id} title={form.table_id ? "" : "Pick a table in Edit first"} onClick={() => update({ status: "booked", table_id: form.table_id }, "Booked. The guest has been told.")}>Confirm with table</button>
            )}
            {r.status === "booked" && <>
              <button className="btn" disabled={busy} onClick={() => update({ status: "seated" }, "Seated")}>Seat now</button>
              <button className="btn ghost" disabled={busy} onClick={() => update({ status: "no_show" }, "Marked as no-show")}>No-show</button>
            </>}
            {r.status === "seated" && <button className="btn" disabled={busy} onClick={() => update({ status: "finished" }, "Finished")}>Finish</button>}
            {["pending", "booked", "waitlist", "request"].includes(r.status) && (
              <button className="btn danger" disabled={busy} onClick={() => update({ status: "cancelled" }, "Cancelled. The guest has been told.")}>Cancel</button>
            )}
            {["cancelled", "no_show", "declined"].includes(r.status) && (
              <button className="btn ghost" disabled={busy} onClick={() => update({ status: "booked" }, "Restored")}>Restore booking</button>
            )}
            <button className="btn ghost" onClick={() => setEdit(!edit)}>{edit ? "Stop editing" : "Edit"}</button>
          </div>

          {["paid", "refund_due", "paid_late"].includes(r.payment_status) && (
            <div className={`notice ${r.payment_status === "paid" ? "" : "err"}`}>
              {r.payment_status === "refund_due" ? "The guest cancelled in time. Their deposit should be refunded." : r.payment_status === "paid_late" ? "The deposit arrived after the hold expired. Rebook the guest or refund them." : `Deposit of ${cedi(r.deposit_ghs)} paid online.`}
              <div className="row" style={{ marginTop: 8 }}>
                {r.payment_ref ? <button className="btn sm" disabled={busy} onClick={refund}>Refund {cedi(r.deposit_ghs)} on Paystack</button> : null}
                <button className="btn ghost sm" disabled={busy} onClick={markRefunded}>Mark as refunded (paid back another way)</button>
              </div>
            </div>
          )}
          {!edit ? (
            <dl className="kv">
              <dt>Phone</dt><dd>+233 {r.guest_phone}</dd>
              <dt>Email</dt><dd>{r.guest_email || "—"}</dd>
              <dt>Table</dt><dd>{table ? `${table.label} (${table.seats} seats)` : "Not assigned"}{area ? ` · ${area.name}` : ""}</dd>
              {expName && <><dt>Booking link</dt><dd>{expName}</dd></>}
              <dt>Seating time</dt><dd>{r.duration_min} min</dd>
              {r.occasion && <><dt>Occasion</dt><dd>{r.occasion}</dd></>}
              {!!r.dietary?.length && <><dt>Dietary</dt><dd>{r.dietary.join(", ")}</dd></>}
              {r.high_chair && <><dt>High chair</dt><dd>Yes</dd></>}
              {Number(r.deposit_ghs) > 0 && <><dt>Deposit</dt><dd>{cedi(r.deposit_ghs)} · {PAY_LABEL[r.payment_status] ?? r.payment_status}{r.payment_method ? ` · ${r.payment_method}` : ""}{r.payment_ref ? <><br /><span className="muted">Paystack ref {r.payment_ref}</span></> : null}</dd></>}
              {r.notes && <><dt>Guest note</dt><dd>“{r.notes}”</dd></>}
              {r.internal_notes && <><dt>Staff note</dt><dd>{r.internal_notes}</dd></>}
              {r.answers && Object.entries(r.answers).map(([k, v]) => {
                const q = business.settings.questions?.find((x) => x.id === k);
                return <span key={k} style={{ display: "contents" }}><dt>{q?.label ?? k}</dt><dd>{String(v === true ? "Yes" : v === false ? "No" : v)}</dd></span>;
              })}
              <dt>Booked</dt><dd>{new Date(r.created_at).toLocaleString("en-GB", { timeZone: tz })}</dd>
            </dl>
          ) : (
            <div className="card-b" style={{ padding: 0 }}>
              <div className="fgrid3">
                <div className="f"><label htmlFor="e-day">Date</label><input id="e-day" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} /></div>
                <div className="f"><label htmlFor="e-time">Time</label><input id="e-time" type="time" step={900} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
                <div className="f"><label htmlFor="e-party">Guests</label><input id="e-party" type="number" min={1} max={60} value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} /></div>
              </div>
              <div className="f"><label htmlFor="e-table">Table</label>
                <select id="e-table" value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })}>
                  <option value="">Not assigned</option>
                  {areas.map((a) => (
                    <optgroup key={a.id} label={a.name}>
                      {tables.filter((t) => t.area_id === a.id).map((t) => <option key={t.id} value={t.id}>{t.label} · {t.seats} seats</option>)}
                    </optgroup>
                  ))}
                </select>
                <small>Staff edits don’t check for clashes. Use the host screen or reservations list to see who else is on that table.</small>
              </div>
              <div className="fgrid">
                <div className="f"><label htmlFor="e-name">Name</label><input id="e-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="f"><label htmlFor="e-phone">Phone</label><input id="e-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="f"><label htmlFor="e-email">Email</label><input id="e-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="f"><label htmlFor="e-occ">Occasion</label><input id="e-occ" value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} /></div>
              </div>
              <div className="f"><label htmlFor="e-notes">Guest note</label><textarea id="e-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="f"><label htmlFor="e-int">Staff note (guests never see this)</label><textarea id="e-int" rows={2} value={form.internal} onChange={(e) => setForm({ ...form, internal: e.target.value })} /></div>
              <div className="row end"><button className="btn" disabled={busy} onClick={saveEdit}>Save changes</button></div>
            </div>
          )}

          <div className="card">
            <div className="card-h"><b>Message this guest</b></div>
            <Composer target={{ reservationId: r.id, label: `${r.guest_name} (${r.guest_email ? "phone + email" : "phone"})` }} onSent={() => setR({ ...r })} />
          </div>

          <div>
            <b>Messages sent</b>
            {!msgs.length ? <p className="muted">None yet.</p> : (
              <div className="tbl-wrap"><table className="tbl"><tbody>
                {msgs.map((m) => (
                  <tr key={m.id}>
                    <td className="muted num" style={{ whiteSpace: "nowrap" }}>{new Date(m.created_at).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{m.channel}</td>
                    <td><span className={`pill ${m.status === "sent" ? "ok" : m.status === "failed" ? "bad" : ""}`} title={m.detail ?? ""}>{m.status}</span></td>
                    <td style={{ maxWidth: 260 }}>{m.body.slice(0, 90)}{m.body.length > 90 ? "…" : ""}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

const PAY_LABEL: Record<string, string> = {
  none: "none", test_paid: "paid (test mode)", awaiting: "waiting for payment", paid: "paid", refund_due: "refund due",
  refunded: "refunded", expired: "not paid, hold expired", paid_late: "paid after hold expired",
};

function toForm(r: Reservation, tz: string) {
  const day = dateKeyIn(r.starts_at, tz);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(r.starts_at));
  return {
    day, time, party: String(r.party_size), table_id: r.table_id ?? "", area_id: r.area_id ?? "", name: r.guest_name,
    phone: "0" + r.guest_phone, email: r.guest_email ?? "", notes: r.notes ?? "", internal: r.internal_notes ?? "", occasion: r.occasion ?? "",
  };
}

/** Minutes the timezone is ahead of UTC at that moment */
export function tzOffsetMinutes(tz: string, at: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - Math.floor(at.getTime() / 60000) * 60000) / 60000;
}
