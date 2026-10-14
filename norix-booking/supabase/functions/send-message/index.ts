// Staff send email / SMS / WhatsApp to one guest, a booking, or a group of guests.
// Requires a signed-in staff member of the business.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, bookingVars, cors, deliver, json, render, RES_SELECT } from "../_shared/send.ts";

type Body = {
  business_id: string;
  channel: "email" | "sms" | "whatsapp";
  subject?: string;
  body: string;
  reservation_id?: string;
  guest_ids?: string[];
  segment?: "all" | "vip" | "regulars" | "today" | "tomorrow" | "lapsed";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Please sign in again." }, 401);

  let input: Body;
  try { input = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (!input.business_id || !["email", "sms", "whatsapp"].includes(input.channel) || !input.body?.trim())
    return json({ error: "Choose a channel and write a message." }, 400);
  const { data: allowed } = await userClient.rpc("is_staff", { p_business: input.business_id });
  if (!allowed) return json({ error: "You are not on the staff list for this business." }, 403);

  const sb = admin();
  const { data: b } = await sb.from("businesses").select("id,slug,name,address,phone,timezone,settings").eq("id", input.business_id).single();
  if (!b) return json({ error: "Business not found" }, 404);

  // Work out recipients
  type Rcpt = { guestId: string | null; name: string; phone: string | null; email: string | null; reservation?: Record<string, unknown> };
  const rcpts: Rcpt[] = [];
  if (input.reservation_id) {
    const { data: r } = await sb.from("reservations").select(RES_SELECT).eq("id", input.reservation_id).eq("business_id", b.id).single();
    if (r) rcpts.push({ guestId: r.guest_id, name: r.guest_name, phone: r.guest_phone, email: r.guest_email, reservation: r });
  } else if (input.guest_ids?.length) {
    const { data: gs } = await sb.from("guests").select("id,name,phone,email").eq("business_id", b.id).in("id", input.guest_ids.slice(0, 500));
    (gs ?? []).forEach((g) => rcpts.push({ guestId: g.id, name: g.name ?? "", phone: g.phone, email: g.email }));
  } else if (input.segment) {
    const tz = b.timezone || "Africa/Accra";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    if (input.segment === "today" || input.segment === "tomorrow") {
      const day = input.segment === "today" ? today : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + 86400_000));
      const from = new Date(`${day}T00:00:00Z`).toISOString(), to = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400_000).toISOString();
      const { data: rs } = await sb.from("reservations").select(RES_SELECT).eq("business_id", b.id).in("status", ["booked", "pending"]).gte("starts_at", from).lt("starts_at", to);
      (rs ?? []).forEach((r) => rcpts.push({ guestId: r.guest_id, name: r.guest_name, phone: r.guest_phone, email: r.guest_email, reservation: r }));
    } else {
      const { data: gs } = await sb.from("guests").select("id,name,phone,email,tags,marketing_opt_in,reservations(starts_at,status)").eq("business_id", b.id).eq("marketing_opt_in", true).limit(2000);
      for (const g of gs ?? []) {
        // deno-lint-ignore no-explicit-any
        const visits = ((g as any).reservations ?? []).filter((x: any) => ["finished", "seated", "booked"].includes(x.status));
        // deno-lint-ignore no-explicit-any
        const last = Math.max(0, ...visits.map((x: any) => new Date(x.starts_at).getTime()));
        const ok = input.segment === "all" ? true
          : input.segment === "vip" ? (g.tags ?? []).includes("VIP")
          : input.segment === "regulars" ? visits.length >= 3
          : input.segment === "lapsed" ? last > 0 && Date.now() - last > 60 * 86400_000
          : false;
        if (ok) rcpts.push({ guestId: g.id, name: g.name ?? "", phone: g.phone, email: g.email });
      }
    }
  }
  if (!rcpts.length) return json({ error: "No guests match that choice." }, 400);
  if (rcpts.length > 500) return json({ error: "That is more than 500 guests. Narrow the group." }, 400);

  const counts = { sent: 0, failed: 0, skipped: 0 };
  let lastDetail = "";
  for (const rc of rcpts) {
    const vars = rc.reservation ? bookingVars(rc.reservation, b)
      : { first_name: (rc.name || "").split(" ")[0] || "there", guest_name: rc.name || "", business: b.name, address: b.address || "",
          business_phone: b.phone || "", booking_link: b.settings?.app_url ? `${String(b.settings.app_url).replace(/\/$/, "")}/${b.slug}` : "" };
    const res = await deliver(sb, {
      business: b, channel: input.channel, phone: rc.phone, email: rc.email,
      subject: input.subject ? render(input.subject, vars) : null, body: render(input.body, vars),
      reservationId: (rc.reservation?.id as string) ?? null, guestId: rc.guestId, sentBy: user.id,
    });
    counts[res.status]++;
    lastDetail = res.detail;
  }
  return json({ ok: true, ...counts, total: rcpts.length, note: counts.sent === 0 ? lastDetail : undefined });
});
