"use client";

import { useState } from "react";
import { callFunction, useDash } from "../ctx";

type Target = { reservationId?: string; guestIds?: string[]; segment?: string; label: string };

const VARS = ["first_name", "business", "date", "time", "party", "ref", "manage_link", "booking_link"];

/** Write and send an email, SMS or WhatsApp to a booking, guests, or a group */
export default function Composer({ target, onSent, compact }: { target: Target; onSent?: () => void; compact?: boolean }) {
  const { sb, business, toast } = useDash();
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const smsParts = Math.ceil(body.length / 160) || 0;

  async function send() {
    if (!body.trim()) { setResult({ ok: false, text: "Write a message first." }); return; }
    if (channel === "email" && !subject.trim()) { setResult({ ok: false, text: "Add an email subject." }); return; }
    setBusy(true); setResult(null);
    try {
      const r = await callFunction<{ sent: number; failed: number; skipped: number; total: number; note?: string }>(sb, "send-message", {
        business_id: business.id, channel, subject: subject || undefined, body,
        reservation_id: target.reservationId, guest_ids: target.guestIds, segment: target.segment,
      });
      const text = r.sent ? `Sent to ${r.sent} of ${r.total}.${r.skipped ? ` ${r.skipped} skipped.` : ""}${r.failed ? ` ${r.failed} failed.` : ""}`
        : `Nothing was sent. ${r.note ?? ""}`;
      setResult({ ok: r.sent > 0, text });
      if (r.sent) { setBody(""); setSubject(""); toast("Message sent"); onSent?.(); }
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <div className="card-b" style={compact ? { padding: 0 } : undefined}>
      <div className="row between">
        <div className="muted">To: <b style={{ color: "var(--ink)" }}>{target.label}</b></div>
        <div className="chips" role="group" aria-label="Channel">
          {(["whatsapp", "sms", "email"] as const).map((c) => (
            <button key={c} className="chip" aria-pressed={channel === c} onClick={() => setChannel(c)}>
              {c === "whatsapp" ? "WhatsApp" : c === "sms" ? "SMS" : "Email"}
            </button>
          ))}
        </div>
      </div>
      {channel === "email" && (
        <div className="f"><label htmlFor="c-subj">Subject</label><input id="c-subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`A note from ${business.name}`} /></div>
      )}
      <div className="f">
        <label htmlFor="c-body">Message</label>
        <textarea id="c-body" rows={compact ? 4 : 6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{first_name}}, …" />
        <small>
          Personalise with {VARS.map((v, i) => (
            <span key={v}>{i ? ", " : ""}<button type="button" className="chip" style={{ padding: "0 6px" }} onClick={() => setBody((b) => b + `{{${v}}}`)}>{`{{${v}}}`}</button></span>
          ))}
          {channel === "sms" && body && <> · about {smsParts} SMS part{smsParts === 1 ? "" : "s"} per guest</>}
        </small>
      </div>
      {result && <div className={`notice ${result.ok ? "ok" : "err"}`}>{result.text}</div>}
      <div className="row end"><button className="btn" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send"}</button></div>
    </div>
  );
}
