"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Question } from "@/lib/types";
import { useDash } from "../../ctx";

/** cal.com "Booking questions": extra questions guests answer when they book */
export default function BookingForm() {
  const { sb, business, isManager, toast } = useDash();
  const router = useRouter();
  const [qs, setQs] = useState<Question[]>(business.settings.questions ?? []);
  const [err, setErr] = useState("");

  const update = (i: number, patch: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  async function save() {
    for (const q of qs) {
      if (!q.label.trim()) { setErr("Every question needs wording."); return; }
      if (q.type === "select" && (q.options ?? []).filter(Boolean).length < 2) { setErr(`“${q.label}” needs at least two choices.`); return; }
    }
    const clean = qs.map((q) => ({ ...q, label: q.label.trim(), options: q.type === "select" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined }));
    const { error } = await sb.from("businesses").update({ settings: { ...business.settings, questions: clean } }).eq("id", business.id);
    if (error) { setErr(error.message); return; }
    setErr(""); toast("Booking form saved"); router.refresh();
  }

  if (!isManager) return <div className="notice">Only owners and managers can change the booking form.</div>;
  return (
    <>
      <div className="dash-head">
        <div><h1>Booking form</h1><p>Name, WhatsApp number, email, occasion, dietary needs and notes are always asked. Add your own questions below.</p></div>
        <button className="btn" onClick={save}>Save form</button>
      </div>
      {err && <div className="notice err">{err}</div>}
      <div className="card">
        <div className="card-b">
          {!qs.length && <p className="muted" style={{ margin: 0 }}>No extra questions yet. Examples: “Smoking or non-smoking?”, “Is this a surprise?”, “How did you hear about us?”</p>}
          {qs.map((q, i) => (
            <div key={q.id} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="fgrid">
                <div className="f"><label htmlFor={`q-l-${i}`}>Question</label><input id={`q-l-${i}`} value={q.label} onChange={(e) => update(i, { label: e.target.value })} /></div>
                <div className="f"><label htmlFor={`q-t-${i}`}>Answer type</label>
                  <select id={`q-t-${i}`} value={q.type} onChange={(e) => update(i, { type: e.target.value as Question["type"], options: e.target.value === "select" ? q.options ?? ["", ""] : undefined })}>
                    <option value="text">Short text</option><option value="select">Pick one</option><option value="checkbox">Yes / no tick box</option>
                  </select>
                </div>
              </div>
              {q.type === "select" && (
                <div className="f"><label htmlFor={`q-o-${i}`}>Choices (one per line)</label>
                  <textarea id={`q-o-${i}`} rows={3} value={(q.options ?? []).join("\n")} onChange={(e) => update(i, { options: e.target.value.split("\n") })} />
                </div>
              )}
              <div className="row between">
                <label className="check"><input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />Required</label>
                <div className="row">
                  <button className="btn ghost sm" disabled={i === 0} onClick={() => { const n = [...qs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setQs(n); }}>Move up</button>
                  <button className="btn danger sm" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <div className="row"><button className="btn ghost" onClick={() => setQs([...qs, { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false }])}>Add question</button></div>
        </div>
      </div>
    </>
  );
}
