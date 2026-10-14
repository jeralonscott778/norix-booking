"use client";

import { useCallback, useEffect, useState } from "react";
import type { Message } from "@/lib/types";
import { useDash } from "../../ctx";
import Composer from "../composer";

const SEGMENTS: [string, string, string][] = [
  ["today", "Today’s guests", "Everyone booked for today"],
  ["tomorrow", "Tomorrow’s guests", "Everyone booked for tomorrow"],
  ["all", "All guests", "Everyone who agreed to hear from you"],
  ["vip", "VIP guests", "Guests tagged VIP"],
  ["regulars", "Regulars", "3 or more visits"],
  ["lapsed", "Haven’t visited in 60 days", "Win them back"],
];

/** Send campaigns and see every message the system has sent */
export default function Messages() {
  const { sb, business } = useDash();
  const tz = business.timezone || "Africa/Accra";
  const [segment, setSegment] = useState("today");
  const [log, setLog] = useState<Message[]>([]);
  const [filter, setFilter] = useState<"all" | "sent" | "failed" | "skipped">("all");

  const load = useCallback(async () => {
    let q = sb.from("messages").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setLog((data ?? []) as Message[]);
  }, [sb, business.id, filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = sb.channel(`msg-${business.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `business_id=eq.${business.id}` }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, business.id, load]);

  const seg = SEGMENTS.find((s) => s[0] === segment)!;
  const skippedNote = log.find((m) => m.status === "skipped" && /not connected/i.test(m.detail ?? ""));

  return (
    <>
      <div className="dash-head"><div><h1>Messages</h1><p>Send WhatsApp, SMS or email to your guests, and see everything that was sent.</p></div></div>
      {skippedNote && <div className="notice">Some channels aren’t connected yet, so those messages were written but not sent ({skippedNote.detail}). Add the keys in Supabase to switch them on.</div>}

      <div className="grid2">
        <div className="card">
          <div className="card-h"><b>New message</b></div>
          <div className="card-b" style={{ paddingBottom: 0 }}>
            <div className="f"><label>Who should get it?</label>
              <div className="chips">{SEGMENTS.map(([k, l]) => <button key={k} className="chip" aria-pressed={segment === k} onClick={() => setSegment(k)}>{l}</button>)}</div>
              <small>{seg[2]}. To message specific people, select them on the Guests page.</small>
            </div>
          </div>
          <Composer target={{ segment, label: seg[1] }} onSent={load} />
        </div>
        <div className="card">
          <div className="card-h"><b>Ideas</b></div>
          <div className="card-b">
            <div className="notice"><b>Running late tonight?</b> “Hi {"{{first_name}}"}, the kitchen is running about 20 minutes behind tonight. Your table will be ready at {"{{time}}"}. Thank you for your patience.” Send to: Today’s guests.</div>
            <div className="notice"><b>Weekend special</b> “Hi {"{{first_name}}"}, this Saturday we have live highlife and a grilled tilapia special. Book your table: {"{{booking_link}}"}” Send to: All guests.</div>
            <div className="notice"><b>We miss you</b> “Hi {"{{first_name}}"}, it’s been a while! Come back this week and dessert is on us. {"{{booking_link}}"}” Send to: Haven’t visited in 60 days.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><b>Sent messages</b>
          <div className="chips">{(["all", "sent", "failed", "skipped"] as const).map((k) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        </div>
        {!log.length ? <div className="empty">No messages yet.</div> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>When</th><th>Channel</th><th>To</th><th>Message</th><th>Status</th><th>Type</th></tr></thead>
            <tbody>
              {log.map((m) => (
                <tr key={m.id}>
                  <td className="muted num" style={{ whiteSpace: "nowrap" }}>{new Date(m.created_at).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{m.channel === "whatsapp" ? "WhatsApp" : m.channel === "sms" ? "SMS" : "Email"}</td>
                  <td className="num">{m.recipient}</td>
                  <td style={{ maxWidth: 340 }}>{m.subject && <b>{m.subject} · </b>}{m.body.slice(0, 120)}{m.body.length > 120 ? "…" : ""}</td>
                  <td><span className={`pill ${m.status === "sent" ? "ok" : m.status === "failed" ? "bad" : ""}`} title={m.detail ?? ""}>{m.status}</span></td>
                  <td className="muted">{m.workflow_id ? "Automatic" : "Staff"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
