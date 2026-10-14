"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Experience, RoutingRule } from "@/lib/types";
import { matchRule } from "@/lib/routing";
import { useDash } from "../../ctx";

const OCCASIONS = ["Birthday", "Anniversary", "Date night", "Business", "Celebration"];
const newRule = (): RoutingRule => ({ id: `r${Date.now().toString(36)}`, name: "", when: {}, recommend: {}, message: "" });

/** cal.com "Routing forms", for seating: answers → the best area or booking link */
export default function SeatRouting() {
  const { sb, business, areas, isManager, toast } = useDash();
  const router = useRouter();
  const questions = business.settings.questions ?? [];
  const [enabled, setEnabled] = useState(business.settings.routing?.enabled ?? false);
  const [rules, setRules] = useState<RoutingRule[]>(business.settings.routing?.rules ?? []);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [err, setErr] = useState("");
  const [tryIt, setTryIt] = useState({ occasion: "Birthday", party: 4, answers: {} as Record<string, string | boolean> });

  const load = useCallback(async () => {
    const { data } = await sb.from("experiences").select("*").eq("business_id", business.id).order("sort");
    setExperiences((data ?? []) as Experience[]);
  }, [sb, business.id]);
  useEffect(() => { load(); }, [load]);

  const update = (i: number, r: RoutingRule) => setRules(rules.map((x, j) => (j === i ? r : x)));
  const move = (i: number, d: number) => { const n = [...rules]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setRules(n); };

  async function save() {
    for (const r of rules) {
      if (!r.name.trim()) { setErr("Every rule needs a name."); return; }
      if (!r.when.occasion && !r.when.party_min && !r.when.party_max && !r.when.question_id) { setErr(`“${r.name}” needs at least one condition.`); return; }
      if (!r.recommend.area_id && !r.recommend.experience) { setErr(`“${r.name}” needs an area or a booking link to recommend.`); return; }
      if (!r.message.trim()) { setErr(`“${r.name}” needs a message for guests.`); return; }
    }
    const { error } = await sb.from("businesses").update({ settings: { ...business.settings, routing: { enabled, rules } } }).eq("id", business.id);
    if (error) { setErr(error.message); return; }
    setErr(""); toast("Seat routing saved"); router.refresh();
  }

  if (!isManager) return <div className="notice">Only owners and managers can change seat routing.</div>;
  const hit = matchRule(rules, tryIt);
  const areaName = (id?: string) => areas.find((a) => a.id === id)?.name;
  const expName = (slug?: string) => experiences.find((e) => e.slug === slug)?.name;

  return (
    <>
      <div className="dash-head">
        <div><h1>Seat routing</h1><p>Recommend the best spot from what guests tell you: the occasion, how many are coming, and their answers.</p></div>
        <button className="btn" onClick={save}>Save routing</button>
      </div>
      {err && <div className="notice err">{err}</div>}

      <div className="card"><div className="card-b">
        <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Show recommendations on the booking page</label>
        <small className="muted">Guests pick their occasion first. The first matching rule below decides what we recommend, so put the most specific rules at the top.</small>
      </div></div>

      <div className="grid2">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rules.map((r, i) => (
            <div className="card" key={r.id}>
              <div className="card-h">
                <input className="inp" style={{ maxWidth: 260, fontWeight: 600 }} placeholder="Rule name, e.g. Birthdays" aria-label="Rule name" value={r.name} onChange={(e) => update(i, { ...r, name: e.target.value })} />
                <div className="row">
                  <span className="muted">#{i + 1}</span>
                  <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button className="btn ghost sm" disabled={i === rules.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button className="btn danger sm" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
              <div className="card-b">
                <b>When</b>
                <div className="fgrid3">
                  <div className="f"><label htmlFor={`o-${r.id}`}>Occasion is</label>
                    <select id={`o-${r.id}`} value={r.when.occasion ?? ""} onChange={(e) => update(i, { ...r, when: { ...r.when, occasion: e.target.value || undefined } })}>
                      <option value="">Any occasion</option>{OCCASIONS.map((o) => <option key={o}>{o}</option>)}
                    </select></div>
                  <div className="f"><label htmlFor={`pmin-${r.id}`}>Party at least</label><input id={`pmin-${r.id}`} type="number" min={1} value={r.when.party_min ?? ""} onChange={(e) => update(i, { ...r, when: { ...r.when, party_min: e.target.value ? Number(e.target.value) : undefined } })} /></div>
                  <div className="f"><label htmlFor={`pmax-${r.id}`}>Party at most</label><input id={`pmax-${r.id}`} type="number" min={1} value={r.when.party_max ?? ""} onChange={(e) => update(i, { ...r, when: { ...r.when, party_max: e.target.value ? Number(e.target.value) : undefined } })} /></div>
                </div>
                {questions.length > 0 && (
                  <div className="fgrid">
                    <div className="f"><label htmlFor={`q-${r.id}`}>And this question</label>
                      <select id={`q-${r.id}`} value={r.when.question_id ?? ""} onChange={(e) => update(i, { ...r, when: { ...r.when, question_id: e.target.value || undefined, answer: undefined } })}>
                        <option value="">No question</option>{questions.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                      </select></div>
                    {r.when.question_id && (() => {
                      const q = questions.find((x) => x.id === r.when.question_id);
                      const opts = q?.type === "checkbox" ? ["Yes", "No"] : q?.type === "select" ? q.options ?? [] : null;
                      return (
                        <div className="f"><label htmlFor={`a-${r.id}`}>Is answered</label>
                          {opts ? (
                            <select id={`a-${r.id}`} value={r.when.answer ?? ""} onChange={(e) => update(i, { ...r, when: { ...r.when, answer: e.target.value || undefined } })}>
                              <option value="">Anything</option>{opts.map((o) => <option key={o}>{o}</option>)}
                            </select>
                          ) : <input id={`a-${r.id}`} placeholder="Exact answer (empty = anything)" value={r.when.answer ?? ""} onChange={(e) => update(i, { ...r, when: { ...r.when, answer: e.target.value || undefined } })} />}
                        </div>
                      );
                    })()}
                  </div>
                )}
                <b>Recommend</b>
                <div className="fgrid">
                  <div className="f"><label htmlFor={`ra-${r.id}`}>Area</label>
                    <select id={`ra-${r.id}`} value={r.recommend.area_id ?? ""} onChange={(e) => update(i, { ...r, recommend: { ...r.recommend, area_id: e.target.value || undefined } })}>
                      <option value="">No area</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select><small>Pre-selected for the guest when it’s free</small></div>
                  <div className="f"><label htmlFor={`re-${r.id}`}>Booking link</label>
                    <select id={`re-${r.id}`} value={r.recommend.experience ?? ""} onChange={(e) => update(i, { ...r, recommend: { ...r.recommend, experience: e.target.value || undefined } })}>
                      <option value="">Keep what they chose</option>{experiences.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                    </select><small>Guests get a button to switch to it</small></div>
                </div>
                <div className="f"><label htmlFor={`m-${r.id}`}>Message to the guest</label>
                  <textarea id={`m-${r.id}`} rows={2} value={r.message} placeholder="Celebrating a birthday? Our terrace tables come with…" onChange={(e) => update(i, { ...r, message: e.target.value })} /></div>
              </div>
            </div>
          ))}
          <button className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={() => setRules([...rules, newRule()])}>Add rule</button>
        </div>

        <div className="card" style={{ position: "sticky", top: 16 }}>
          <div className="card-h"><b>Try it</b><span className="muted">Updates as you edit</span></div>
          <div className="card-b">
            <div className="fgrid">
              <div className="f"><label htmlFor="t-occ">Guest’s occasion</label>
                <select id="t-occ" value={tryIt.occasion} onChange={(e) => setTryIt({ ...tryIt, occasion: e.target.value })}>
                  <option value="None">None</option>{OCCASIONS.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div className="f"><label htmlFor="t-party">Guests</label><input id="t-party" type="number" min={1} max={40} value={tryIt.party} onChange={(e) => setTryIt({ ...tryIt, party: Number(e.target.value) || 1 })} /></div>
            </div>
            {questions.map((q) => (
              <div className="f" key={q.id}><label htmlFor={`t-${q.id}`}>{q.label}</label>
                {q.type === "checkbox" ? (
                  <select id={`t-${q.id}`} value={tryIt.answers[q.id] === true ? "Yes" : tryIt.answers[q.id] === false ? "No" : ""} onChange={(e) => setTryIt({ ...tryIt, answers: { ...tryIt.answers, [q.id]: e.target.value === "" ? "" : e.target.value === "Yes" } })}>
                    <option value="">Not answered</option><option>Yes</option><option>No</option>
                  </select>
                ) : q.type === "select" ? (
                  <select id={`t-${q.id}`} value={String(tryIt.answers[q.id] ?? "")} onChange={(e) => setTryIt({ ...tryIt, answers: { ...tryIt.answers, [q.id]: e.target.value } })}>
                    <option value="">Not answered</option>{(q.options ?? []).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : <input id={`t-${q.id}`} value={String(tryIt.answers[q.id] ?? "")} onChange={(e) => setTryIt({ ...tryIt, answers: { ...tryIt.answers, [q.id]: e.target.value } })} />}
              </div>
            ))}
            {hit ? (
              <div className="notice ok">
                <b>Rule “{hit.name}” matches.</b><br />
                {areaName(hit.recommend.area_id) && <>Area: <b>{areaName(hit.recommend.area_id)}</b><br /></>}
                {expName(hit.recommend.experience) && <>Booking link: <b>{expName(hit.recommend.experience)}</b><br /></>}
                Guest sees: “{hit.message}”
              </div>
            ) : <div className="notice">No rule matches. The guest books normally.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
