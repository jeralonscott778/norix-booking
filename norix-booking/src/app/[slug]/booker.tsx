"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Area, BookingResult, Business, Slot } from "@/lib/types";
import {
  addDays, cedi, dayName, fmtSlot, fromKey, isDayOpen, keyOf, longDate, normalisePhone, todayIn,
} from "@/lib/format";
import { bookTable } from "./actions";
import { IconCal, IconCheck, IconClock, IconLeft, IconPhone, IconPin, IconRight, IconUsers } from "./icons";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const OCCASIONS = ["None", "Birthday", "Anniversary", "Date night", "Business", "Celebration"];
const DIETS = ["Vegetarian", "Vegan", "Halal", "Nut allergy", "Shellfish allergy", "Gluten-free"];
const PAYS = ["MTN MoMo", "Telecel Cash", "AirtelTigo Money", "Card"];

type Props = { business: Business; areas: Area[]; has3d: boolean };
type Step = "find" | "details" | "done";

export default function Booker({ business: b, areas, has3d }: Props) {
  const set = b.settings ?? {};
  const maxOnline = set.max_online_party ?? 8;
  const today = useMemo(() => todayIn(b.timezone || "Africa/Accra"), [b.timezone]);
  const firstOpen = useMemo(() => {
    let k = today;
    for (let i = 0; i < 14; i++) { if (isDayOpen(b, k, today)) return k; k = addDays(k, 1); }
    return today;
  }, [b, today]);

  const [party, setParty] = useState(2);
  const [big, setBig] = useState(maxOnline + 2);
  const [day, setDay] = useState(firstOpen);
  const [ym, setYm] = useState<[number, number]>(() => { const d = fromKey(firstOpen); return [d.getFullYear(), d.getMonth()]; });
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotErr, setSlotErr] = useState("");
  const [step, setStep] = useState<Step>("find");
  const [time, setTime] = useState<string | null>(null);
  const [wait, setWait] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  const [occasion, setOccasion] = useState("None");
  const [diet, setDiet] = useState<string[]>([]);
  const [highChair, setHighChair] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [pay, setPay] = useState("MTN MoMo");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [result, setResult] = useState<BookingResult | null>(null);
  const [pending, startTransition] = useTransition();

  const isBig = party > maxOnline;
  const guests = isBig ? big : party;

  const loadSlots = useCallback(async () => {
    setSlots(null); setSlotErr("");
    const { data, error } = await supabaseBrowser().rpc("get_availability", { p_slug: b.slug, p_day: day, p_party: guests });
    if (error) { setSlotErr(error.message); setSlots([]); return; }
    setSlots((data ?? []) as Slot[]);
  }, [b.slug, day, guests]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const areaObj = areas.find((a) => a.id === area);
  const deposit = isBig || wait ? 0
    : areaObj && Number(areaObj.deposit_ghs) > 0 ? Number(areaObj.deposit_ghs)
    : set.group_deposit_from && party >= set.group_deposit_from ? party * (set.group_deposit_per_head ?? 0) : 0;

  const scrollUp = () => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} };

  function pickSlot(s: Slot) {
    setTime(s.slot);
    const full = !isBig && s.area_ids.length === 0;
    setWait(full);
    setArea(!isBig && s.area_ids.length === 1 ? s.area_ids[0] : null);
    setErrors({}); setBanner(""); setStep("details"); scrollUp();
  }

  function submit() {
    const e: Record<string, string> = {};
    if (!isBig && !wait && !area) e.area = "Choose where you’d like to sit.";
    if (form.name.trim().length < 2) e.name = "Enter the name for the booking.";
    if (!normalisePhone(form.phone)) e.phone = "Enter a 9-digit Ghana number, for example 24 123 4567.";
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = "That email address does not look right.";
    setErrors(e);
    if (Object.keys(e).length || !time) return;
    setBanner("");
    startTransition(async () => {
      const res = await bookTable({
        slug: b.slug, day, time, party: guests, areaId: area, name: form.name.trim(), phone: form.phone,
        email: form.email.trim(), occasion, dietary: diet, highChair, notes: form.note.trim(),
        paymentMethod: deposit ? pay : null, waitlist: wait,
      });
      if (!res.ok) {
        setBanner(res.error);
        if (/taken|full|not available/i.test(res.error)) loadSlots();
        return;
      }
      setResult(res.result); setStep("done"); scrollUp();
    });
  }

  function reset() {
    setStep("find"); setTime(null); setArea(null); setWait(false); setOccasion("None"); setDiet([]);
    setHighChair(false); setForm({ name: "", phone: "", email: "", note: "" }); setErrors({}); setBanner(""); setResult(null);
    loadSlots(); scrollUp();
  }

  /* ---------- left column ---------- */
  const info = (
    <div className="bk-col">
      <div className="bk-logo" aria-hidden>{b.name.slice(0, 1)}</div>
      <div>
        <h1 className="bk-name">{b.name}</h1>
        {b.tagline && <div className="bk-muted">{b.tagline}</div>}
      </div>
      <div className="bk-meta">
        {b.address && <div><IconPin /><span>{b.address}</span></div>}
        {!!set.sittings?.length && (
          <div><IconClock /><span>Seatings<br />{set.sittings.map((s) => <span key={s.name}>{s.name} {fmtSlot(s.from)} to {fmtSlot(s.last)}<br /></span>)}</span></div>
        )}
        {b.phone && <div><IconPhone /><span>{b.phone}</span></div>}
      </div>
      {step === "details" && time && (
        <div className="bk-sum">
          <div><IconUsers /><span className="bk-hl">{guests} {guests === 1 ? "guest" : "guests"}</span></div>
          <div><IconCal /><span className="bk-hl">{longDate(day)}<br />{fmtSlot(time)}{wait ? " · waitlist" : isBig ? " · request" : ""}</span></div>
        </div>
      )}
      <div className="bk-policy">
        <span>Tables are held for {set.hold_minutes ?? 15} minutes.</span>
        <span>Free cancellation up to {set.cancel_hours ?? 4} hours before.</span>
      </div>
      <div className="bk-powered">Reservations by Norix</div>
    </div>
  );

  /* ---------- step 1 ---------- */
  if (step === "find") {
    const [y, m] = ym;
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const t = fromKey(today);
    const canPrev = !(y === t.getFullYear() && m === t.getMonth());
    const canNext = new Date(y, m + 1, 1) <= fromKey(addDays(today, set.book_ahead_days ?? 60));
    const moveMonth = (d: number) => { let nm = m + d, ny = y; if (nm < 0) { nm = 11; ny--; } if (nm > 11) { nm = 0; ny++; } setYm([ny, nm]); };

    const groups: Record<string, Slot[]> = {};
    (slots ?? []).forEach((s) => { (groups[s.sitting] ||= []).push(s); });

    return (
      <div className="bk">
        <div className="bk-grid">
          {info}
          <div className="bk-col">
            <div className="bk-label">Guests</div>
            <div className="bk-party" role="group" aria-label="Number of guests">
              {Array.from({ length: Math.min(8, maxOnline) }, (_, i) => i + 1).map((n) => (
                <button key={n} className="bk-pbtn" aria-pressed={!isBig && party === n} onClick={() => setParty(n)}>{n}</button>
              ))}
              <button className="bk-pbtn" aria-pressed={isBig} onClick={() => setParty(maxOnline + 1)}>{maxOnline + 1}+</button>
            </div>
            {isBig && (
              <div className="bk-box">
                <b>Booking for a group?</b>
                <span className="bk-note">For {maxOnline + 1} or more guests we confirm on WhatsApp, usually within 2 hours.</span>
                <div className="bk-calhead">
                  <span>How many guests?</span>
                  <div className="bk-navs">
                    <button aria-label="Fewer guests" onClick={() => setBig(Math.max(maxOnline + 1, big - 1))}>−</button>
                    <b style={{ minWidth: 36, textAlign: "center" }}>{big}</b>
                    <button aria-label="More guests" onClick={() => setBig(Math.min(40, big + 1))}>+</button>
                  </div>
                </div>
              </div>
            )}
            <div className="bk-calhead">
              <b>{MONTHS[m]} <span>{y}</span></b>
              <div className="bk-navs">
                <button aria-label="Previous month" disabled={!canPrev} onClick={() => moveMonth(-1)}><IconLeft /></button>
                <button aria-label="Next month" disabled={!canNext} onClick={() => moveMonth(1)}><IconRight /></button>
              </div>
            </div>
            <div className="bk-cal">
              {["MON","TUE","WED","THU","FRI","SAT","SUN"].map((w) => <div key={w} className="bk-wd">{w}</div>)}
              {Array.from({ length: lead }, (_, i) => <div key={"b" + i} className="bk-day blank" aria-hidden />)}
              {Array.from({ length: days }, (_, i) => {
                const k = keyOf(y, m, i + 1);
                const open = isDayOpen(b, k, today);
                const closed = k >= today && (set.closed_days ?? []).includes(fromKey(k).getDay());
                return (
                  <button key={k} className={`bk-day${open ? " open" : ""}${closed ? " closed" : ""}${k === today ? " today" : ""}`}
                    disabled={!open} aria-pressed={day === k} aria-label={longDate(k) + (open ? "" : ", unavailable")}
                    onClick={() => { setDay(k); setTime(null); }}>{i + 1}</button>
                );
              })}
            </div>
            <div className="bk-note">Times are Accra time (GMT).</div>
            {has3d && !isBig && (
              <Link className="bk-link3d" href={`/${b.slug}/3d?day=${day}&party=${party}`}>
                <span>Want a particular table? Look around the room in 3D.</span><b>Open 3D →</b>
              </Link>
            )}
          </div>
          <div className="bk-col bk-sit">
            <div className="bk-sithead">
              <b>{dayName(day)} {fromKey(day).getDate()}</b>
              <span className="bk-note">{isBig ? `Pick a preferred time for your group of ${big}.` : `Table for ${party}. Dashed times are full; you can join the waitlist.`}</span>
            </div>
            {slots === null ? (
              <div className="bk-loading"><i /><i /><i /></div>
            ) : slotErr ? (
              <div className="bk-banner">{slotErr}</div>
            ) : !slots.length ? (
              <div className="bk-note">No times left on this day. Try another date.</div>
            ) : (
              Object.entries(groups).map(([name, list]) => (
                <div className="bk-sitting" key={name}>
                  <h3>{name}{!isBig && <span>{list.filter((x) => x.area_ids.length).length} open</span>}</h3>
                  <div className="bk-slots">
                    {list.map((s) => {
                      const full = !isBig && !s.area_ids.length;
                      const n = s.area_ids.length;
                      const one = n === 1 ? areas.find((a) => a.id === s.area_ids[0])?.name.split(" ")[0] : "";
                      return (
                        <button key={s.slot} className={`bk-slot${full ? " wait" : ""}`} onClick={() => pickSlot(s)}>
                          <b>{fmtSlot(s.slot)}</b>
                          <small>{isBig ? "Request" : full ? "Waitlist" : n === 1 ? one : `${n} areas`}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- step 3 ---------- */
  if (step === "done" && result) {
    const title = result.status === "request" ? "Request sent"
      : result.status === "waitlist" ? "You’re on the waitlist"
      : `See you ${dayName(day)} at ${fmtSlot(time!)}`;
    const sub = result.status === "request" ? `${b.name} will confirm your table for ${result.party} on WhatsApp.`
      : result.status === "waitlist" ? `You’re number ${result.waitlist_position} for that time. We’ll message you on WhatsApp if a table opens.`
      : `Your confirmation is on its way to WhatsApp${form.email ? " and email" : ""}.`;
    return (
      <div className="bk">
        <div className="bk-done">
          <div className="bk-tick"><IconCheck /></div>
          <h2>{title}</h2>
          <p>{sub}</p>
          <dl className="bk-recap">
            <dt>Restaurant</dt><dd>{b.name}{b.address ? `, ${b.address}` : ""}</dd>
            <dt>When</dt><dd>{longDate(day)}, {fmtSlot(time!)}</dd>
            <dt>Party</dt><dd>{result.party} {result.party === 1 ? "guest" : "guests"}{highChair ? " + high chair" : ""}</dd>
            {result.status === "booked" && result.area && <><dt>Seating</dt><dd>{result.area}{result.table ? ` · table ${result.table}` : ""}</dd></>}
            {occasion !== "None" && <><dt>Occasion</dt><dd>{occasion}</dd></>}
            {Number(result.deposit) > 0 && <><dt>Deposit</dt><dd>{cedi(result.deposit)} (test mode)</dd></>}
            <dt>Reference</dt><dd className="bk-ref">{result.ref}</dd>
          </dl>
          <p className="bk-note">Running late? Reply to the WhatsApp message and we’ll hold your table.</p>
          <button className="bk-btn ghost" onClick={reset}>Make another booking</button>
        </div>
      </div>
    );
  }

  /* ---------- step 2 ---------- */
  const free = slots?.find((s) => s.slot === time)?.area_ids ?? [];
  return (
    <div className="bk">
      <div className="bk-grid two">
        {info}
        <div className="bk-col">
          {banner && <div className="bk-banner" role="alert">{banner}</div>}
          {isBig ? (
            <div className="bk-box"><b>Group request for {big} guests</b><span className="bk-note">We’ll check the private room and set menus, then confirm on WhatsApp.</span></div>
          ) : wait ? (
            <div className="bk-box"><b>This time is full. Join the waitlist?</b><span className="bk-note">If a table opens, we’ll message you on WhatsApp.</span></div>
          ) : (
            <>
              <div className="bk-label">Where would you like to sit?</div>
              <div className="bk-areas">
                {areas.map((a) => {
                  const ok = free.includes(a.id);
                  const why = party > a.max_party ? `Up to ${a.max_party} guests` : party < a.min_party ? `From ${a.min_party} guests` : "Full at this time";
                  return (
                    <button key={a.id} className="bk-area" aria-pressed={area === a.id} disabled={!ok}
                      onClick={() => { setArea(a.id); setErrors((e) => ({ ...e, area: "" })); }}>
                      <b>{a.name}</b>
                      <small>{ok ? `${a.description ?? ""}${Number(a.deposit_ghs) > 0 ? ` · ${cedi(a.deposit_ghs)} deposit` : ""}` : why}</small>
                    </button>
                  );
                })}
              </div>
              {errors.area && <div className="bk-err">{errors.area}</div>}
            </>
          )}

          <div className="bk-label">Is it a special occasion?</div>
          <div className="bk-chips">
            {OCCASIONS.map((o) => <button key={o} className="bk-chip" aria-pressed={occasion === o} onClick={() => setOccasion(o)}>{o}</button>)}
          </div>
          <div className="bk-label">Dietary needs</div>
          <div className="bk-chips">
            {DIETS.map((o) => (
              <button key={o} className="bk-chip" aria-pressed={diet.includes(o)}
                onClick={() => setDiet((d) => (d.includes(o) ? d.filter((x) => x !== o) : [...d, o]))}>{o}</button>
            ))}
          </div>
          <div className="bk-toggle">
            <span>Need a high chair?</span>
            <button className="bk-sw" role="switch" aria-label="High chair" aria-checked={highChair} onClick={() => setHighChair(!highChair)} />
          </div>

          <div className="bk-pair">
            <div className="bk-fld">
              <label htmlFor="f-name">Name for the booking</label>
              <input id="f-name" value={form.name} autoComplete="name" placeholder="Kofi Mensah" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <div className="bk-err">{errors.name}</div>}
            </div>
            <div className="bk-fld">
              <label htmlFor="f-phone">WhatsApp number</label>
              <div className="bk-ph"><span>+233</span>
                <input id="f-phone" value={form.phone} inputMode="tel" autoComplete="tel-national" placeholder="24 123 4567" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              {errors.phone && <div className="bk-err">{errors.phone}</div>}
            </div>
          </div>
          <div className="bk-fld">
            <label htmlFor="f-email">Email <span className="bk-muted">(for your confirmation)</span></label>
            <input id="f-email" value={form.email} inputMode="email" autoComplete="email" placeholder="you@example.com" onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <div className="bk-err">{errors.email}</div>}
          </div>
          <div className="bk-fld">
            <label htmlFor="f-note">Anything else?</label>
            <textarea id="f-note" rows={2} value={form.note} placeholder="A cake for the table, a quiet corner, arriving a little late…" onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>

          {deposit > 0 && (
            <div className="bk-box">
              <b>Deposit: {cedi(deposit)}</b>
              <span className="bk-note">Taken off your bill. Refunded if you cancel 24 hours before.</span>
              <div className="bk-chips">{PAYS.map((n) => <button key={n} className="bk-chip" aria-pressed={pay === n} onClick={() => setPay(n)}>{n}</button>)}</div>
              <span className="bk-note">Payments are in test mode during setup. No money is taken.</span>
            </div>
          )}

          <div className="bk-actions">
            <button className="bk-btn ghost" onClick={() => { setStep("find"); setErrors({}); setBanner(""); }}>Back</button>
            <button className="bk-btn" disabled={pending} onClick={submit}>
              {pending ? "Reserving…" : isBig ? "Send request" : wait ? "Join waitlist" : deposit ? `Pay ${cedi(deposit)} and reserve` : "Reserve table"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
