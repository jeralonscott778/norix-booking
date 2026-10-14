// Shared sending helpers for the Norix Booking edge functions.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

type Result = { status: "sent" | "failed" | "skipped"; detail: string };
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function sendEmail(to: string, subject: string, text: string, fromName: string): Promise<Result> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { status: "skipped", detail: "Email is not connected yet (RESEND_API_KEY missing)" };
  const fromAddr = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";
  const from = fromAddr.includes("<") ? fromAddr : `${fromName} <${fromAddr}>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#16181b;font-size:15px;line-height:1.55">${
    esc(text).split("\n").map((l) => (l.trim() ? `<p style="margin:0 0 10px">${l}</p>` : "")).join("")
  }<p style="margin-top:22px;font-size:12px;color:#6b6e75">Sent by ${esc(fromName)} · Reservations by Norix</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  return { status: r.ok ? "sent" : "failed", detail: (await r.text()).slice(0, 400) };
}

export async function sendWhatsApp(toIntl: string, text: string): Promise<Result> {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) return { status: "skipped", detail: "WhatsApp is not connected yet" };
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  let r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ messaging_product: "whatsapp", to: toIntl, type: "text", text: { body: text } }) });
  if (r.ok) return { status: "sent", detail: "text" };
  const first = await r.text();
  const tpl = Deno.env.get("WHATSAPP_TEMPLATE");
  if (!tpl) return { status: "failed", detail: first.slice(0, 400) };
  r = await fetch(url, {
    method: "POST", headers,
    body: JSON.stringify({ messaging_product: "whatsapp", to: toIntl, type: "template", template: { name: tpl, language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en_US" } } }),
  });
  return { status: r.ok ? "sent" : "failed", detail: "template: " + (await r.text()).slice(0, 380) };
}

export async function sendSms(toIntl: string, text: string): Promise<Result> {
  const key = Deno.env.get("ARKESEL_API_KEY");
  const sender = Deno.env.get("SMS_SENDER");
  if (!key || !sender) return { status: "skipped", detail: "SMS is not connected yet" };
  const r = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ sender, message: text.slice(0, 600), recipients: [toIntl] }),
  });
  return { status: r.ok ? "sent" : "failed", detail: (await r.text()).slice(0, 400) };
}

export const intl = (phone9: string) => "233" + String(phone9).replace(/\D/g, "").slice(-9);

/** Fills {{placeholders}}; unknown ones become empty */
export function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

// deno-lint-ignore no-explicit-any
export function bookingVars(r: any, b: any): Record<string, string> {
  const tz = b.timezone || "Africa/Accra";
  const d = new Date(r.starts_at);
  const appUrl = String(b.settings?.app_url || "").replace(/\/$/, "");
  const name = String(r.guest_name || "");
  return {
    first_name: name.split(" ")[0] || "there",
    guest_name: name,
    business: b.name,
    address: b.address || "",
    business_phone: b.phone || "",
    date: new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(" ", ""),
    party: `${r.party_size} ${r.party_size === 1 ? "guest" : "guests"}`,
    ref: r.ref || "",
    area: r.areas?.name || "",
    table: r.dining_tables?.label || "",
    hold_minutes: String(b.settings?.hold_minutes ?? 15),
    manage_link: appUrl && r.manage_token ? `${appUrl}/manage/${r.manage_token}` : "reply to this message",
    booking_link: appUrl ? `${appUrl}/${b.slug}` : "",
  };
}

/** Sends one message on one channel and logs it */
export async function deliver(
  sb: SupabaseClient,
  opts: {
    business: { id: string; name: string };
    channel: "email" | "sms" | "whatsapp";
    phone?: string | null;
    email?: string | null;
    subject?: string | null;
    body: string;
    reservationId?: string | null;
    guestId?: string | null;
    workflowId?: string | null;
    sentBy?: string | null;
  },
): Promise<Result> {
  let res: Result;
  let recipient = "";
  if (opts.channel === "email") {
    recipient = opts.email || "";
    res = recipient ? await sendEmail(recipient, opts.subject || opts.business.name, opts.body, opts.business.name)
      : { status: "skipped", detail: "No email address" };
  } else {
    recipient = opts.phone ? "+" + intl(opts.phone) : "";
    if (!recipient) res = { status: "skipped", detail: "No phone number" };
    else res = opts.channel === "sms" ? await sendSms(intl(opts.phone!), opts.body) : await sendWhatsApp(intl(opts.phone!), opts.body);
  }
  await sb.from("messages").insert({
    business_id: opts.business.id, reservation_id: opts.reservationId ?? null, guest_id: opts.guestId ?? null,
    workflow_id: opts.workflowId ?? null, channel: opts.channel, recipient: recipient || "-", subject: opts.subject ?? null,
    body: opts.body, status: res.status, detail: res.detail, sent_by: opts.sentBy ?? null,
  });
  return res;
}

export const RES_SELECT =
  "id,ref,business_id,guest_id,guest_name,guest_phone,guest_email,party_size,starts_at,duration_min,status,created_at,updated_at,manage_token,deposit_ghs,areas(name),dining_tables(label),businesses(id,slug,name,address,phone,timezone,settings)";
