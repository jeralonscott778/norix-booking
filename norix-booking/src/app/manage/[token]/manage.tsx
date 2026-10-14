"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Slot } from "@/lib/types";
import { addDays, dateKeyIn, fmtSlot, fromKey, longDate, timeIn, todayIn } from "@/lib/format";
import { manageCancel, manageReschedule } from "../../[slug]/actions";
import type { ManagedBooking } from "./page";

const STATUS: Record<string, string> = {
  held: "Waiting for your deposit payment", pending: "Waiting for the restaurant to confirm", booked: "Confirmed", seated: "You’re seated", finished: "Completed",
  no_show: "Missed", cancelled: "Cancelled", waitlist: "On the waitlist", request: "Group request sent", declined: "Not available",
};

/** Guests view, move or cancel their own booking */
export default function ManageBooking({ token, booking }: { token: string; booking: ManagedBooking }) {
  const b = booking.business;
  const tz = b.timezone || "Africa/Accra";
  const today = todayIn(tz);
  const [bk, setBk] = useState(booking);
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [day, setDay] = useState(dateKeyIn(booking.starts_at, tz) >= today ? dateKeyIn(booking.starts_at, tz) : today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (mode !== "move") return;
    setSlots(null);
    supabaseBrowser().rpc("get_slots", { p_slug: b.slug, p_day: day, p_party: bk.party, p_experience: bk.experience_slug ?? null }).then(({ data, error }) => {
      if (error) { setErr(error.message); setSlots([]); return; }
      setSlots(((data ?? []) as Slot[]).filter((s) => s.area_ids.length));
    });
  }, [mode, day, b.slug, bk.party, bk.experience_slug]);

  const canChange = ["pending", "booked"].includes(bk.status);
  const canCancel = ["held", "pending", "booked", "waitlist", "request"].includes(bk.status);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  function move(time: string) {
    setErr("");
    start(async () => {
      const r = await manageReschedule(token, day, time);
      if (!r.ok) { setErr(r.error); return; }
      setBk({ ...bk, starts_at: r.result.starts_at, table: r.result.table });
      setMode("view"); setDone("Your booking has been moved. We’ve sent you a new confirmation.");
    });
  }
  function cancel() {
    setErr("");
    start(async () => {
      const r = await manageCancel(token);
      if (!r.ok) { setErr(r.error); return; }
      const refund = bk.payment_status === "paid";
      setBk({ ...bk, status: "cancelled", payment_status: refund ? "refund_due" : bk.payment_status }); setMode("view");
      setDone(refund ? "Your booking is cancelled. Your deposit will be refunded to the same MoMo wallet or card." : "Your booking is cancelled. We hope to see you another time.");
    });
  }

  return (
    <div className="bk" style={{ maxWidth: 560 }}>
      <div className="bk-col">
        <div className="bk-logo" aria-hidden>{b.name.slice(0, 1)}</div>
        <div>
          <div className="bk-muted">{b.name}</div>
          <h1 className="bk-name">Your booking</h1>
        </div>
        {done && <div className="bk-box"><b>{done}</b></div>}
        {err && <div className="bk-banner" role="alert">{err}</div>}

        <dl className="bk-recap" style={{ margin: 0 }}>
          <dt>Status</dt><dd>{STATUS[bk.status] ?? bk.status}</dd>
          <dt>When</dt><dd>{longDate(dateKeyIn(bk.starts_at, tz))}, {timeIn(bk.starts_at, tz)}</dd>
          {bk.experience && <><dt>Booking</dt><dd>{bk.experience}</dd></>}
          <dt>Party</dt><dd>{bk.party} {bk.party === 1 ? "guest" : "guests"}</dd>
          {Number(bk.deposit) > 0 && <><dt>Deposit</dt><dd>GH₵ {bk.deposit} · {({ paid: "paid", test_paid: "paid (test mode)", awaiting: "not paid yet", refund_due: "refund on its way", refunded: "refunded" } as Record<string, string>)[bk.payment_status ?? ""] ?? bk.payment_status}</dd></>}
          {bk.area && <><dt>Seating</dt><dd>{bk.area}</dd></>}
          {bk.occasion && <><dt>Occasion</dt><dd>{bk.occasion}</dd></>}
          {b.address && <><dt>Where</dt><dd>{b.address}</dd></>}
          <dt>Name</dt><dd>{bk.name}</dd>
          <dt>Reference</dt><dd className="bk-ref">{bk.ref}</dd>
        </dl>

        {mode === "view" && (
          <div className="bk-actions" style={{ justifyContent: "flex-start" }}>
            {canChange && <button className="bk-btn" onClick={() => { setMode("move"); setErr(""); setDone(""); }}>Change date or time</button>}
            {canCancel && <button className="bk-btn ghost" onClick={() => { setMode("cancel"); setErr(""); setDone(""); }}>Cancel booking</button>}
            {!canCancel && <Link className="bk-btn ghost" href={`/${b.slug}`}>Make a new booking</Link>}
          </div>
        )}

        {mode === "cancel" && (
          <div className="bk-box">
            <b>Cancel this booking?</b>
            <span className="bk-note">Free cancellation up to {b.settings?.cancel_hours ?? 4} hours before. {Number(bk.deposit) > 0 ? "Your deposit is refunded if you cancel in time." : ""}</span>
            <div className="bk-actions" style={{ justifyContent: "flex-start" }}>
              <button className="bk-btn" disabled={pending} onClick={cancel}>{pending ? "Cancelling…" : "Yes, cancel it"}</button>
              <button className="bk-btn ghost" onClick={() => setMode("view")}>Keep my booking</button>
            </div>
          </div>
        )}

        {mode === "move" && (
          <div className="bk-box">
            <b>Pick a new time for {bk.party}</b>
            <div className="bk-chips">
              {dates.map((k) => (
                <button key={k} className="bk-chip" aria-pressed={day === k} onClick={() => setDay(k)}>
                  {k === today ? "Today" : fromKey(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                </button>
              ))}
            </div>
            {slots === null ? <div className="bk-loading"><i /></div> : !slots.length ? <span className="bk-note">No free times that day. Try another.</span> : (
              <div className="bk-slots">
                {slots.map((s) => <button key={s.slot} className="bk-slot" disabled={pending} onClick={() => move(s.slot)}><b>{fmtSlot(s.slot)}</b><small>{s.sitting}</small></button>)}
              </div>
            )}
            <div className="bk-actions" style={{ justifyContent: "flex-start" }}><button className="bk-btn ghost" onClick={() => setMode("view")}>Back</button></div>
          </div>
        )}

        {b.phone && <p className="bk-note">Questions? Call {b.name} on {b.phone}.</p>}
        <div className="bk-powered">Reservations by Norix</div>
      </div>
    </div>
  );
}
