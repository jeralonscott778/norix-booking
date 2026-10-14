// Paystack deposits for Norix Booking.
//   action "init"         public  — start checkout for a held booking, returns the Paystack page URL
//   action "verify"       public  — check a payment after the guest returns, confirm the booking
//   action "refund"       staff   — refund a paid deposit
//   action "integrations" staff   — which apps are connected
//   Paystack webhook      POST with x-paystack-signature — confirms payments even if the guest closes the page
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, cors, json } from "../_shared/send.ts";

const PAYSTACK = "https://api.paystack.co";
const secret = () => Deno.env.get("PAYSTACK_SECRET_KEY") || "";

async function paystack(path: string, init: RequestInit = {}) {
  const r = await fetch(PAYSTACK + path, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) throw new Error(j.message || `Paystack error ${r.status}`);
  return j;
}

async function hmac512(key: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function staffFor(req: Request, businessId: string) {
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const { data: ok } = await userClient.rpc("is_staff", { p_business: businessId });
  return ok ? user : null;
}

/** Confirms a booking once Paystack says the money arrived */
async function settle(reference: string) {
  const sb = admin();
  const { data: r } = await sb.from("reservations").select("id,ref,status,deposit_ghs,payment_status,after_payment_status,manage_token,table_id,starts_at,duration_min")
    .eq("payment_ref", reference).maybeSingle();
  if (!r) return { ok: false, error: "Payment not linked to a booking." };
  if (r.payment_status === "paid") return { ok: true, already: true, ref: r.ref, status: r.status, manage_token: r.manage_token };
  const v = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const d = v.data;
  if (d.status !== "success") return { ok: false, error: d.gateway_response || "The payment was not completed.", ref: r.ref, manage_token: r.manage_token };
  if (d.currency !== "GHS" || Number(d.amount) < Math.round(Number(r.deposit_ghs) * 100)) return { ok: false, error: "Amount paid does not match the deposit." };
  const channel = d.channel === "mobile_money" ? `MoMo ${d.authorization?.bank ?? ""}`.trim() : d.channel === "card" ? `Card ${d.authorization?.card_type ?? ""}`.trim() : d.channel;
  if (r.status === "held") {
    await sb.from("reservations").update({ status: r.after_payment_status || "booked", payment_status: "paid", paid_at: new Date().toISOString(), payment_method: channel }).eq("id", r.id);
    return { ok: true, ref: r.ref, status: r.after_payment_status || "booked", manage_token: r.manage_token };
  }
  // Paid after the hold expired: keep the money on record so staff can rebook or refund
  await sb.from("reservations").update({ payment_status: "paid_late", paid_at: new Date().toISOString(), payment_method: channel, internal_notes: "Deposit paid after the 20-minute hold expired. Rebook or refund." }).eq("id", r.id);
  return { ok: false, error: "Your payment arrived after the table hold expired. The restaurant will contact you to rebook or refund.", ref: r.ref, manage_token: r.manage_token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text();

  // Paystack webhook
  const sig = req.headers.get("x-paystack-signature");
  if (sig) {
    if (!secret() || (await hmac512(secret(), raw)) !== sig) return json({ error: "Bad signature" }, 401);
    const ev = JSON.parse(raw);
    if (ev.event === "charge.success" && ev.data?.reference) await settle(ev.data.reference).catch(() => {});
    return json({ ok: true });
  }

  // deno-lint-ignore no-explicit-any
  let input: any;
  try { input = JSON.parse(raw); } catch { return json({ error: "Bad request" }, 400); }
  const sb = admin();

  try {
    if (input.action === "init") {
      if (!secret()) return json({ error: "Online payment is not connected yet." }, 400);
      const { data: r } = await sb.from("reservations")
        .select("id,ref,status,deposit_ghs,guest_email,guest_phone,guest_name,manage_token,businesses(slug,name,settings)")
        .eq("ref", String(input.ref || "")).eq("manage_token", String(input.token || "")).maybeSingle();
      if (!r) return json({ error: "Booking not found." }, 404);
      if (r.status !== "held") return json({ error: "This booking does not need a payment." }, 400);
      // deno-lint-ignore no-explicit-any
      const b = (r as any).businesses;
      const appUrl = String(b.settings?.app_url || input.origin || "").replace(/\/$/, "");
      const reference = `${r.ref}-${Date.now().toString(36).toUpperCase()}`;
      const init = await paystack("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: r.guest_email || `${r.guest_phone}@guests.norix.app`,
          amount: Math.round(Number(r.deposit_ghs) * 100),
          currency: "GHS",
          reference,
          channels: ["mobile_money", "card"],
          callback_url: `${appUrl}/pay/return`,
          metadata: { booking_ref: r.ref, business: b.name, guest: r.guest_name, phone: "+233" + r.guest_phone },
        }),
      });
      await sb.from("reservations").update({ payment_ref: reference }).eq("id", r.id);
      return json({ ok: true, url: init.data.authorization_url });
    }

    if (input.action === "verify") {
      if (!secret()) return json({ error: "Online payment is not connected yet." }, 400);
      return json(await settle(String(input.reference || "")));
    }

    if (input.action === "refund") {
      const { data: r } = await sb.from("reservations").select("id,business_id,payment_ref,payment_status,deposit_ghs").eq("id", String(input.reservation_id || "")).maybeSingle();
      if (!r) return json({ error: "Booking not found." }, 404);
      if (!(await staffFor(req, r.business_id))) return json({ error: "Staff only." }, 403);
      if (!["paid", "refund_due", "paid_late"].includes(r.payment_status) || !r.payment_ref) return json({ error: "There is no online payment to refund." }, 400);
      if (!secret()) return json({ error: "Online payment is not connected yet." }, 400);
      await paystack("/refund", { method: "POST", body: JSON.stringify({ transaction: r.payment_ref }) });
      await sb.from("reservations").update({ payment_status: "refunded" }).eq("id", r.id);
      return json({ ok: true });
    }

    if (input.action === "integrations") {
      if (!(await staffFor(req, String(input.business_id || "")))) return json({ error: "Staff only." }, 403);
      const has = (k: string) => !!Deno.env.get(k);
      return json({
        paystack: has("PAYSTACK_SECRET_KEY"), paystack_live: secret().startsWith("sk_live_"),
        whatsapp: has("WHATSAPP_TOKEN") && has("WHATSAPP_PHONE_ID"),
        sms: has("ARKESEL_API_KEY") && has("SMS_SENDER"),
        email: has("RESEND_API_KEY"), owner_alerts: has("OWNER_WHATSAPP"),
      });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
