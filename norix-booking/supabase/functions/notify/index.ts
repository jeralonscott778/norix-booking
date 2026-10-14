// Runs the automations for a booking event (booked, confirmed, cancelled, rescheduled, ...).
// Called by a database trigger. Safe to call publicly: it re-checks the booking's real state
// and every automation runs at most once per event.
import { admin, bookingVars, cors, deliver, json, render, RES_SELECT } from "../_shared/send.ts";

const MATCH: Record<string, string[]> = {
  booked: ["booked"], pending: ["pending"], confirmed: ["booked"], waitlist: ["waitlist"], request: ["request"],
  cancelled: ["cancelled"], no_show: ["no_show"], declined: ["declined"], rescheduled: ["booked", "pending"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // deno-lint-ignore no-explicit-any
  let input: any;
  try { input = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const sb = admin();

  const q = sb.from("reservations").select(RES_SELECT);
  const { data: r } = input.id ? await q.eq("id", input.id).maybeSingle() : await q.eq("ref", String(input.ref || "")).maybeSingle();
  if (!r) return json({ error: "Not found" }, 404);
  const event = String(input.event || r.status);
  if (!MATCH[event]?.includes(r.status)) return json({ ok: true, skipped: "state changed" });
  if (Date.now() - new Date(r.updated_at).getTime() > 15 * 60 * 1000) return json({ error: "Too late" }, 409);

  // deno-lint-ignore no-explicit-any
  const b = (r as any).businesses;
  const vars = bookingVars(r, b);
  const runKey = event === "rescheduled" ? `${event}:${r.updated_at}` : event;
  const { data: flows } = await sb.from("workflows").select("*").eq("business_id", b.id).eq("trigger", event).eq("active", true);

  const sent: Record<string, string> = {};
  for (const w of flows ?? []) {
    const { error: dup } = await sb.from("workflow_runs").insert({ workflow_id: w.id, reservation_id: r.id, run_key: runKey, status: "running" });
    if (dup) continue; // already ran for this event
    const res = await deliver(sb, {
      business: b, channel: w.channel, phone: r.guest_phone, email: r.guest_email,
      subject: w.subject ? render(w.subject, vars) : null, body: render(w.body, vars),
      reservationId: r.id, guestId: r.guest_id, workflowId: w.id,
    });
    await sb.from("workflow_runs").update({ status: res.status, detail: res.detail }).eq("workflow_id", w.id).eq("reservation_id", r.id).eq("run_key", runKey);
    sent[`${w.name} (${w.channel})`] = res.status;
  }

  // Alert the restaurant on WhatsApp about new bookings
  const owner = Deno.env.get("OWNER_WHATSAPP");
  if (owner && b.settings?.owner_alerts !== false && ["booked", "pending", "request", "waitlist", "cancelled"].includes(event)) {
    const msg = `${event === "cancelled" ? "Cancelled" : "New " + event}: ${r.guest_name}, ${vars.party}, ${vars.date} ${vars.time}${vars.table ? ", table " + vars.table : ""}. Ref ${r.ref}.`;
    sent.owner = (await deliver(sb, { business: b, channel: "whatsapp", phone: owner.replace(/\D/g, "").slice(-9), body: msg, reservationId: r.id })).status;
  }
  return json({ ok: true, event, sent });
});
