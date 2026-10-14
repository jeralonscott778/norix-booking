"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings, Sitting } from "@/lib/types";
import { fromKey, todayIn } from "@/lib/format";
import { WEEKDAYS, useDash } from "../../ctx";

type Override = { id: string; day: string; closed: boolean; sittings: Sitting[]; note: string | null };
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

/** cal.com "Availability" + "Date overrides" + event-type limits, for a restaurant */
export default function Availability() {
  const { sb, business, isManager, toast } = useDash();
  const router = useRouter();
  const s = business.settings;
  const [weekly, setWeekly] = useState<Record<string, Sitting[]>>(() => {
    if (s.weekly) return s.weekly;
    const base = s.sittings ?? [];
    return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), (s.closed_days ?? []).includes(d) ? [] : base.map((x) => ({ ...x }))]));
  });
  const [rules, setRules] = useState({
    seat_minutes: s.seat_minutes ?? 90, slot_step_minutes: s.slot_step_minutes ?? 30, min_notice_minutes: s.min_notice_minutes ?? 45,
    book_ahead_days: s.book_ahead_days ?? 60, max_online_party: s.max_online_party ?? 8, cancel_hours: s.cancel_hours ?? 4,
    hold_minutes: s.hold_minutes ?? 15, group_deposit_from: s.group_deposit_from ?? 8, group_deposit_per_head: s.group_deposit_per_head ?? 50,
    requires_confirmation: s.requires_confirmation ?? false,
  });
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [ov, setOv] = useState({ day: todayIn(business.timezone || "Africa/Accra"), closed: true, from: "18:00", last: "22:00", note: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const loadOv = useCallback(async () => {
    const { data } = await sb.from("date_overrides").select("*").eq("business_id", business.id).gte("day", todayIn(business.timezone || "Africa/Accra")).order("day");
    setOverrides((data ?? []) as Override[]);
  }, [sb, business.id, business.timezone]);
  useEffect(() => { loadOv(); }, [loadOv]);

  const setDay = (d: number, list: Sitting[]) => setWeekly({ ...weekly, [String(d)]: list });

  async function saveAll() {
    for (const [d, list] of Object.entries(weekly)) {
      for (const x of list) {
        if (!x.name.trim() || !x.from || !x.last) { setErr(`Fill in every seating on ${WEEKDAYS[+d]}.`); return; }
        if (x.last < x.from) { setErr(`On ${WEEKDAYS[+d]}, “${x.name}” last seating is before it opens.`); return; }
      }
    }
    setSaving(true); setErr("");
    const settings: Settings = { ...s, ...rules, weekly };
    const { error } = await sb.from("businesses").update({ settings }).eq("id", business.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    toast("Opening hours and rules saved"); router.refresh();
  }
  async function addOverride() {
    const row = { business_id: business.id, day: ov.day, closed: ov.closed, sittings: ov.closed ? [] : [{ name: "Special", from: ov.from, last: ov.last }], note: ov.note.trim() || null };
    const { error } = await sb.from("date_overrides").upsert(row, { onConflict: "business_id,day" });
    if (error) { setErr(error.message); return; }
    toast("Special day saved"); setOv({ ...ov, note: "" }); loadOv();
  }
  async function removeOverride(id: string) {
    await sb.from("date_overrides").delete().eq("id", id); loadOv();
  }

  if (!isManager) return <div className="notice">Only owners and managers can change opening hours.</div>;
  const num = (k: keyof typeof rules, label: string, help: string, min = 0, max = 1000) => (
    <div className="f"><label htmlFor={`r-${k}`}>{label}</label>
      <input id={`r-${k}`} type="number" min={min} max={max} value={Number(rules[k])} onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value) })} />
      <small>{help}</small></div>
  );

  return (
    <>
      <div className="dash-head">
        <div><h1>Opening hours & rules</h1><p>When guests can book, and the rules that protect your tables.</p></div>
        <button className="btn" disabled={saving} onClick={saveAll}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
      {err && <div className="notice err">{err}</div>}

      <div className="card">
        <div className="card-h"><b>Weekly seatings</b><span className="muted">“Last seating” is the latest time a table can be booked.</span></div>
        <div className="card-b">
          {ORDER.map((d) => {
            const list = weekly[String(d)] ?? [];
            return (
              <div className="day-block" key={d}>
                <div><b>{WEEKDAYS[d]}</b><br /><span className="muted">{list.length ? `${list.length} seating${list.length > 1 ? "s" : ""}` : "Closed"}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {list.map((x, i) => (
                    <div className="sitting-row" key={i}>
                      <input className="inp" aria-label="Seating name" value={x.name} onChange={(e) => setDay(d, list.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                      <input className="inp" type="time" aria-label="First seating" value={x.from} onChange={(e) => setDay(d, list.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)))} />
                      <input className="inp" type="time" aria-label="Last seating" value={x.last} onChange={(e) => setDay(d, list.map((y, j) => (j === i ? { ...y, last: e.target.value } : y)))} />
                      <button className="btn ghost sm" onClick={() => setDay(d, list.filter((_, j) => j !== i))}>Remove</button>
                    </div>
                  ))}
                  <div className="row">
                    <button className="btn ghost sm" onClick={() => setDay(d, [...list, { name: list.length ? "Dinner" : "Lunch", from: list.length ? "18:00" : "12:00", last: list.length ? "22:00" : "15:00" }])}>Add seating</button>
                    {list.length > 0 && <button className="btn ghost sm" onClick={() => setDay(d, [])}>Closed all day</button>}
                    <button className="btn ghost sm" onClick={() => { const copy = Object.fromEntries(Object.keys(weekly).map((k) => [k, list.map((x) => ({ ...x }))])); setWeekly(copy); }}>Copy to every day</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><b>Booking rules</b></div>
        <div className="card-b">
          <div className="fgrid3">
            {num("seat_minutes", "Table time (minutes)", "How long a table is held per booking", 30, 360)}
            {num("slot_step_minutes", "Time slots every (minutes)", "15, 30 or 60", 15, 120)}
            {num("min_notice_minutes", "Minimum notice (minutes)", "No bookings closer than this to the time", 0, 2880)}
            {num("book_ahead_days", "Book up to (days ahead)", "How far into the future guests can book", 1, 365)}
            {num("max_online_party", "Largest party online", "Bigger groups send a request instead", 1, 40)}
            {num("cancel_hours", "Free cancellation until (hours before)", "After this, guests must call", 0, 168)}
            {num("hold_minutes", "Hold tables for (minutes)", "Shown to guests as your late policy", 0, 120)}
            {num("group_deposit_from", "Group deposit from (guests)", "Parties this size or bigger pay a deposit", 1, 60)}
            {num("group_deposit_per_head", "Group deposit per guest (GH₵)", "0 means no group deposit", 0, 5000)}
          </div>
          <label className="check"><input type="checkbox" checked={rules.requires_confirmation} onChange={(e) => setRules({ ...rules, requires_confirmation: e.target.checked })} />
            Staff must confirm each online booking before it’s final (guests see “request received”)</label>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><b>Special days</b><span className="muted">Holidays, private events, or different hours for one day</span></div>
        <div className="card-b">
          <div className="fgrid3">
            <div className="f"><label htmlFor="o-day">Date</label><input id="o-day" type="date" value={ov.day} onChange={(e) => setOv({ ...ov, day: e.target.value })} /></div>
            <div className="f"><label htmlFor="o-type">That day we are</label>
              <select id="o-type" value={ov.closed ? "closed" : "hours"} onChange={(e) => setOv({ ...ov, closed: e.target.value === "closed" })}>
                <option value="closed">Closed</option><option value="hours">Open with different hours</option>
              </select>
            </div>
            <div className="f"><label htmlFor="o-note">Note (staff only)</label><input id="o-note" value={ov.note} placeholder="Independence Day, private wedding…" onChange={(e) => setOv({ ...ov, note: e.target.value })} /></div>
          </div>
          {!ov.closed && (
            <div className="fgrid">
              <div className="f"><label htmlFor="o-from">First seating</label><input id="o-from" type="time" value={ov.from} onChange={(e) => setOv({ ...ov, from: e.target.value })} /></div>
              <div className="f"><label htmlFor="o-last">Last seating</label><input id="o-last" type="time" value={ov.last} onChange={(e) => setOv({ ...ov, last: e.target.value })} /></div>
            </div>
          )}
          <div className="row end"><button className="btn" onClick={addOverride}>Save special day</button></div>
          {overrides.length > 0 && (
            <div className="tbl-wrap"><table className="tbl"><tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td>{fromKey(o.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                  <td>{o.closed ? <span className="pill bad">Closed</span> : o.sittings.map((x) => `${x.from}–${x.last}`).join(", ")}</td>
                  <td className="muted">{o.note}</td>
                  <td><button className="btn ghost sm" onClick={() => removeOverride(o.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      </div>
    </>
  );
}
