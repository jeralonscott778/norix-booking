"use client";

import { useCallback, useEffect, useState } from "react";
import type { Workflow } from "@/lib/types";
import { useDash } from "../../ctx";

const TRIGGERS: [Workflow["trigger"], string, boolean][] = [
  ["booked", "When a booking is made", false],
  ["pending", "When a booking needs confirming", false],
  ["confirmed", "When staff confirm a booking", false],
  ["before_start", "Before the booking (reminder)", true],
  ["after_end", "After the meal (thank you, review)", true],
  ["rescheduled", "When a booking is moved", false],
  ["cancelled", "When a booking is cancelled", false],
  ["no_show", "When a guest doesn’t show up", false],
  ["waitlist", "When a guest joins the waitlist", false],
  ["request", "When a group request comes in", false],
];
const VARS = ["first_name", "guest_name", "business", "date", "time", "party", "area", "table", "ref", "hold_minutes", "manage_link", "booking_link", "address", "business_phone"];
const blank: Omit<Workflow, "id"> = { name: "", trigger: "before_start", offset_minutes: 120, channel: "whatsapp", subject: "", body: "", active: true };

/** cal.com "Workflows": automatic messages for every stage of a booking */
export default function Automations() {
  const { sb, business, isManager, toast } = useDash();
  const [rows, setRows] = useState<Workflow[]>([]);
  const [edit, setEdit] = useState<(Omit<Workflow, "id"> & { id?: string }) | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data } = await sb.from("workflows").select("*").eq("business_id", business.id).order("created_at");
    setRows((data ?? []) as Workflow[]);
  }, [sb, business.id]);
  useEffect(() => { load(); }, [load]);

  async function toggle(w: Workflow) {
    await sb.from("workflows").update({ active: !w.active }).eq("id", w.id);
    toast(w.active ? "Automation paused" : "Automation switched on"); load();
  }
  async function save() {
    if (!edit) return;
    if (!edit.name.trim() || !edit.body.trim()) { setErr("Give it a name and a message."); return; }
    if (edit.channel === "email" && !edit.subject?.trim()) { setErr("Emails need a subject."); return; }
    const row = { name: edit.name.trim(), trigger: edit.trigger, offset_minutes: Math.max(0, Number(edit.offset_minutes) || 0), channel: edit.channel,
      subject: edit.channel === "email" ? edit.subject : null, body: edit.body, active: edit.active, business_id: business.id };
    const { error } = edit.id ? await sb.from("workflows").update(row).eq("id", edit.id) : await sb.from("workflows").insert(row);
    if (error) { setErr(error.message); return; }
    setEdit(null); setErr(""); toast("Automation saved"); load();
  }
  async function remove() {
    if (!edit?.id) return;
    const { error } = await sb.from("workflows").delete().eq("id", edit.id);
    if (error) { setErr(error.message); return; }
    setEdit(null); toast("Automation deleted"); load();
  }

  const timed = (t: Workflow["trigger"]) => t === "before_start" || t === "after_end";
  const when = (w: Pick<Workflow, "trigger" | "offset_minutes">) => {
    const label = TRIGGERS.find((t) => t[0] === w.trigger)?.[1] ?? w.trigger;
    if (!timed(w.trigger)) return label;
    const h = w.offset_minutes / 60;
    const amount = w.offset_minutes % 60 === 0 ? `${h} hour${h === 1 ? "" : "s"}` : `${w.offset_minutes} minutes`;
    return w.trigger === "before_start" ? `${amount} before the booking` : `${amount} after the meal`;
  };

  return (
    <>
      <div className="dash-head">
        <div><h1>Automations</h1><p>Messages that go out on their own: confirmations, reminders, thank-yous and follow-ups.</p></div>
        {isManager && <button className="btn" onClick={() => { setEdit({ ...blank }); setErr(""); }}>New automation</button>}
      </div>

      <div className="card">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Automation</th><th>When it sends</th><th>Channel</th><th>On</th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className={isManager ? "click" : ""} onClick={() => { if (isManager) { setEdit({ ...w }); setErr(""); } }}>
                <td><b>{w.name}</b><br /><span className="muted">{w.body.slice(0, 80)}{w.body.length > 80 ? "…" : ""}</span></td>
                <td>{when(w)}</td>
                <td>{w.channel === "whatsapp" ? "WhatsApp" : w.channel === "sms" ? "SMS" : "Email"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <label className="check"><input type="checkbox" checked={w.active} disabled={!isManager} onChange={() => toggle(w)} aria-label={`Switch ${w.name} on or off`} />{w.active ? "On" : "Off"}</label>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {!rows.length && <div className="empty">No automations yet.</div>}
      </div>
      <p className="muted" style={{ margin: 0 }}>Timed messages are checked every 5 minutes. A reminder is skipped if the booking was made after its send time.</p>

      {edit && (
        <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <aside className="drawer" role="dialog" aria-label="Edit automation">
            <div className="drawer-h"><h2>{edit.id ? "Edit automation" : "New automation"}</h2><button className="btn ghost sm" onClick={() => setEdit(null)}>Close</button></div>
            <div className="drawer-b">
              <div className="f"><label htmlFor="w-name">Name</label><input id="w-name" value={edit.name} placeholder="Reminder the morning of" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="f"><label htmlFor="w-trig">Send it</label>
                <select id="w-trig" value={edit.trigger} onChange={(e) => setEdit({ ...edit, trigger: e.target.value as Workflow["trigger"] })}>
                  {TRIGGERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              {timed(edit.trigger) && (
                <div className="f"><label htmlFor="w-off">How long {edit.trigger === "before_start" ? "before the booking" : "after the meal ends"}</label>
                  <select id="w-off" value={edit.offset_minutes} onChange={(e) => setEdit({ ...edit, offset_minutes: Number(e.target.value) })}>
                    {[30, 60, 120, 180, 240, 360, 720, 1440, 2880].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : m < 1440 ? `${m / 60} hours` : `${m / 1440} day${m === 1440 ? "" : "s"}`}</option>)}
                  </select>
                </div>
              )}
              <div className="f"><label>Channel</label>
                <div className="chips">{(["whatsapp", "sms", "email"] as const).map((c) => <button key={c} className="chip" aria-pressed={edit.channel === c} onClick={() => setEdit({ ...edit, channel: c })}>{c === "whatsapp" ? "WhatsApp" : c === "sms" ? "SMS" : "Email"}</button>)}</div>
                {edit.channel === "email" && <small>Only goes to guests who gave an email address.</small>}
              </div>
              {edit.channel === "email" && <div className="f"><label htmlFor="w-subj">Subject</label><input id="w-subj" value={edit.subject ?? ""} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></div>}
              <div className="f"><label htmlFor="w-body">Message</label>
                <textarea id="w-body" rows={8} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
                <small>Insert: {VARS.map((v, i) => <span key={v}>{i ? " " : ""}<button type="button" className="chip" style={{ padding: "0 6px", margin: "2px 0" }} onClick={() => setEdit({ ...edit, body: edit.body + `{{${v}}}` })}>{`{{${v}}}`}</button></span>)}</small>
              </div>
              <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Switched on</label>
              {err && <div className="notice err">{err}</div>}
              <div className="row between">
                {edit.id ? <button className="btn danger" onClick={remove}>Delete</button> : <span />}
                <button className="btn" onClick={save}>Save automation</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
