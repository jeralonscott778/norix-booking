"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { callFunction, useDash } from "../../ctx";

type Status = { paystack: boolean; paystack_live: boolean; whatsapp: boolean; sms: boolean; email: boolean; owner_alerts: boolean };

const APPS: { key: keyof Status; name: string; what: string; keys: string; how: string[] }[] = [
  { key: "paystack", name: "Paystack", what: "Deposits by MTN MoMo, Telecel Cash, AirtelTigo Money and card, plus refunds.",
    keys: "PAYSTACK_SECRET_KEY",
    how: ["Sign up at paystack.com and choose Ghana.", "Settings → API Keys & Webhooks: copy the Secret key (sk_test_… to test, sk_live_… once approved).",
      "Paste the webhook URL below into Paystack’s Webhook URL box.", "Add the key in Supabase (see the bottom of this page), then switch on online payments here."] },
  { key: "whatsapp", name: "WhatsApp Business", what: "Confirmations, reminders and messages on WhatsApp.",
    keys: "WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (optional: WHATSAPP_TEMPLATE)",
    how: ["developers.facebook.com → Create app → Business → add WhatsApp.", "API Setup: copy the access token and the Phone number ID.",
      "Until Meta verifies the business, only numbers you add as test recipients get messages."] },
  { key: "sms", name: "Arkesel SMS", what: "SMS confirmations and reminders on any Ghana network.",
    keys: "ARKESEL_API_KEY, SMS_SENDER", how: ["Sign up at arkesel.com, buy credit.", "Request a sender ID (for example KOZO). It must be approved before it sends.", "Copy your API key."] },
  { key: "email", name: "Resend email", what: "Email confirmations, thank-yous and campaigns.",
    keys: "RESEND_API_KEY, RESEND_FROM", how: ["Sign up at resend.com and create an API key.", "Add the restaurant’s domain so emails come from it, e.g. reservations@kozo.com.gh. Until then it only sends to your own address."] },
  { key: "owner_alerts", name: "Owner WhatsApp alerts", what: "The restaurant’s own WhatsApp gets a message for every new booking or cancellation.",
    keys: "OWNER_WHATSAPP", how: ["Set it to the restaurant’s WhatsApp number, e.g. 0241234567.", "Needs WhatsApp Business connected."] },
];

/** cal.com "Apps": what’s connected, and how to connect the rest */
export default function Apps() {
  const { sb, business, isManager, toast } = useDash();
  const router = useRouter();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const mode = business.settings.payments ?? "test";
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = projectUrl.replace("https://", "").split(".")[0];

  useEffect(() => {
    callFunction<Status>(sb, "payments", { action: "integrations", business_id: business.id }).then(setSt).catch((e) => setErr((e as Error).message));
  }, [sb, business.id]);

  async function setMode(m: "test" | "paystack") {
    if (m === "paystack" && !st?.paystack) { toast("Add the Paystack key first"); return; }
    const { error } = await sb.from("businesses").update({ settings: { ...business.settings, payments: m } }).eq("id", business.id);
    if (error) { toast(error.message); return; }
    toast(m === "paystack" ? "Online payments switched on" : "Back to test mode"); router.refresh();
  }

  return (
    <>
      <div className="dash-head"><div><h1>Apps</h1><p>Payments and messaging services this restaurant uses.</p></div></div>
      {err && <div className="notice err">{err}</div>}

      <div className="card">
        <div className="card-h"><b>Deposits</b><span className={`pill ${mode === "paystack" ? "ok" : "warn"}`}>{mode === "paystack" ? (st?.paystack_live ? "Live payments" : "Paystack test payments") : "Test mode: no money taken"}</span></div>
        <div className="card-b">
          <p style={{ margin: 0 }}>{mode === "paystack"
            ? "Guests pay deposits on Paystack. Their table is held for 20 minutes while they pay; unpaid holds are released automatically."
            : "Deposits are shown to guests but nothing is charged. Use this for demos."}</p>
          {isManager && (
            <div className="row">
              <button className="btn" disabled={mode === "paystack"} onClick={() => setMode("paystack")}>Use Paystack</button>
              <button className="btn ghost" disabled={mode === "test"} onClick={() => setMode("test")}>Use test mode</button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        {APPS.map((a) => {
          const on = st ? st[a.key] : null;
          return (
            <div key={a.key} className="card-b" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="row between">
                <div><b>{a.name}</b><div className="muted">{a.what}</div></div>
                <div className="row">
                  <span className={`pill ${on ? "ok" : on === false ? "" : ""}`}>{on === null ? "Checking…" : on ? "Connected" : "Not connected"}</span>
                  <button className="btn ghost sm" onClick={() => setOpen(open === a.key ? null : a.key)}>{open === a.key ? "Hide steps" : "How to connect"}</button>
                </div>
              </div>
              {open === a.key && (
                <div className="notice">
                  <ol style={{ margin: "0 0 8px", paddingLeft: 18 }}>{a.how.map((h) => <li key={h}>{h}</li>)}</ol>
                  Supabase secret name: <code>{a.keys}</code>
                  {a.key === "paystack" && <div style={{ marginTop: 8 }}>Webhook URL: <div className="code">{`${projectUrl}/functions/v1/payments`}</div></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card"><div className="card-b">
        <b>Where keys go</b>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Open supabase.com → project <b>norix-booking</b>{ref ? ` (${ref})` : ""}.</li>
          <li>Edge Functions → Secrets → Add new secret.</li>
          <li>Use the exact secret name shown for each app, paste the value, Save. It works within a minute; refresh this page to see “Connected”.</li>
        </ol>
      </div></div>
    </>
  );
}
