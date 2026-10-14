// Sends timed automations: reminders before a booking and follow-ups after it.
// Called every 5 minutes by the database scheduler. Each message is sent once per booking.
import { admin, bookingVars, cors, deliver, json, render, RES_SELECT } from "../_shared/send.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  const now = Date.now();
  const { data: flows } = await sb.from("workflows").select("*").in("trigger", ["before_start", "after_end"]).eq("active", true);
  let sent = 0, skipped = 0;

  for (const w of flows ?? []) {
    const off = Math.max(0, w.offset_minutes) * 60_000;
    let query = sb.from("reservations").select(RES_SELECT).eq("business_id", w.business_id);
    if (w.trigger === "before_start") {
      // due when "offset" before the start has passed, and the booking hasn't started yet
      query = query.in("status", ["booked", "pending"])
        .gt("starts_at", new Date(now).toISOString())
        .lte("starts_at", new Date(now + off).toISOString());
    } else {
      // after the meal: start + seating length + offset has passed, within the last day
      query = query.in("status", ["finished", "seated", "booked"])
        .lte("starts_at", new Date(now - off).toISOString())
        .gte("starts_at", new Date(now - off - 26 * 3600_000).toISOString());
    }
    const { data: rows } = await query.limit(200);
    for (const r of rows ?? []) {
      const start = new Date(r.starts_at).getTime();
      if (w.trigger === "before_start" && new Date(r.created_at).getTime() > start - off) { skipped++; continue; } // booked too late for this reminder
      if (w.trigger === "after_end" && start + r.duration_min * 60_000 + off > now) continue;
      const { error: dup } = await sb.from("workflow_runs").insert({ workflow_id: w.id, reservation_id: r.id, run_key: "", status: "running" });
      if (dup) continue;
      // deno-lint-ignore no-explicit-any
      const b = (r as any).businesses;
      const vars = bookingVars(r, b);
      const res = await deliver(sb, {
        business: b, channel: w.channel, phone: r.guest_phone, email: r.guest_email,
        subject: w.subject ? render(w.subject, vars) : null, body: render(w.body, vars),
        reservationId: r.id, guestId: r.guest_id, workflowId: w.id,
      });
      await sb.from("workflow_runs").update({ status: res.status, detail: res.detail }).eq("workflow_id", w.id).eq("reservation_id", r.id).eq("run_key", "");
      sent++;
    }
  }
  return json({ ok: true, sent, skipped });
});
