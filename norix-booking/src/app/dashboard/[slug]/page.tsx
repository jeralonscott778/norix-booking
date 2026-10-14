"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Reservation } from "@/lib/types";
import { addDays, dateKeyIn, fromKey, timeIn, todayIn } from "@/lib/format";
import { SOURCE_LABEL, STATUS_LABEL, useDash } from "../ctx";
import ReservationDrawer from "./reservation-drawer";
import NewReservation from "./new-reservation";

/** Overview: today at a glance, things that need action, and the last 30 days (cal.com "Insights") */
export default function Overview() {
  const { sb, business } = useDash();
  const tz = business.timezone || "Africa/Accra";
  const today = useMemo(() => todayIn(tz), [tz]);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [open, setOpen] = useState<Reservation | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const from = fromKey(addDays(today, -31)).toISOString();
    const to = fromKey(addDays(today, 15)).toISOString();
    const { data } = await sb.from("reservations").select("*").eq("business_id", business.id).gte("starts_at", from).lt("starts_at", to).order("starts_at");
    setRows((data ?? []) as Reservation[]);
  }, [sb, business.id, today]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = sb.channel(`ov-${business.id}`).on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `business_id=eq.${business.id}` }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, business.id, load]);

  const day = (r: Reservation) => dateKeyIn(r.starts_at, tz);
  const live = rows.filter((r) => !["cancelled", "declined"].includes(r.status));
  const todays = live.filter((r) => day(r) === today && !["waitlist", "request"].includes(r.status));
  const pending = live.filter((r) => ["pending", "waitlist", "request"].includes(r.status) && day(r) >= today);
  const upcoming = live.filter((r) => day(r) >= today && ["booked", "pending"].includes(r.status)).slice(0, 8);

  // last 30 days
  const past = rows.filter((r) => day(r) < today && day(r) >= addDays(today, -30));
  const served = past.filter((r) => ["finished", "seated", "booked"].includes(r.status));
  const noShows = past.filter((r) => r.status === "no_show").length;
  const covers30 = served.reduce((s, r) => s + r.party_size, 0);
  const noShowRate = served.length + noShows ? Math.round((noShows / (served.length + noShows)) * 100) : 0;
  const cancelled30 = past.filter((r) => r.status === "cancelled").length;

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const coversByDay = days.map((k) => rows.filter((r) => day(r) === k && ["finished", "seated", "booked"].includes(r.status)).reduce((s, r) => s + r.party_size, 0));
  const maxCovers = Math.max(1, ...coversByDay);

  const sources = Object.entries(past.concat(todays).reduce<Record<string, number>>((acc, r) => { acc[r.source] = (acc[r.source] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const maxSrc = Math.max(1, ...sources.map((s) => s[1]));
  const hours = Array.from({ length: 24 }, (_, h) => served.filter((r) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(r.starts_at))) === h).length);
  const busiest = hours.indexOf(Math.max(...hours));

  return (
    <>
      <div className="dash-head">
        <div><h1>Overview</h1><p>{fromKey(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p></div>
        <div className="row">
          <Link className="btn ghost" href={`/${business.slug}/host`}>Open host screen</Link>
          <button className="btn" onClick={() => setAdding(true)}>New reservation</button>
        </div>
      </div>

      <div className="grid4">
        <div className="card stat"><small>Reservations today</small><b>{todays.length}</b><span>{todays.reduce((s, r) => s + r.party_size, 0)} covers</span></div>
        <div className="card stat"><small>Seated right now</small><b>{todays.filter((r) => r.status === "seated").length}</b><span>{todays.filter((r) => r.status === "booked").length} still to arrive</span></div>
        <div className="card stat"><small>Needs your action</small><b>{pending.length}</b><span>to confirm, waitlist, groups</span></div>
        <div className="card stat"><small>No-show rate (30 days)</small><b>{noShowRate}%</b><span>{noShows} no-shows · {cancelled30} cancelled</span></div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-h"><b>Needs your action</b><Link href={`/dashboard/${business.slug}/reservations`} className="muted">All reservations →</Link></div>
          {!pending.length ? <div className="empty">Nothing waiting. New requests show up here.</div> : (
            <div className="tbl-wrap"><table className="tbl"><tbody>
              {pending.map((r) => (
                <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                  <td className="num">{fromKey(day(r)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {timeIn(r.starts_at, tz)}</td>
                  <td>{r.guest_name} · {r.party_size}</td>
                  <td><span className={`pill ${STATUS_LABEL[r.status][0]}`}>{STATUS_LABEL[r.status][1]}</span></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
        <div className="card">
          <div className="card-h"><b>Coming up</b></div>
          {!upcoming.length ? <div className="empty">No upcoming reservations.</div> : (
            <div className="tbl-wrap"><table className="tbl"><tbody>
              {upcoming.map((r) => (
                <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                  <td className="num">{day(r) === today ? "Today" : fromKey(day(r)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}, {timeIn(r.starts_at, tz)}</td>
                  <td>{r.guest_name} · {r.party_size}</td>
                  <td className="muted">{SOURCE_LABEL[r.source] ?? r.source}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-h"><b>Covers, last 14 days</b><span className="muted">{covers30} covers in 30 days</span></div>
          <div className="card-b">
            <div className="bars">{coversByDay.map((c, i) => <div key={days[i]} style={{ height: `${(c / maxCovers) * 100}%` }} data-tip={`${fromKey(days[i]).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${c}`} />)}</div>
            <div className="axis"><span>{fromKey(days[0]).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><span>Today</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><b>Where bookings come from</b>{served.length > 0 && <span className="muted">Busiest: {busiest}:00</span>}</div>
          <div className="card-b">
            {!sources.length ? <p className="muted">Not enough bookings yet.</p> : sources.map(([s, n]) => (
              <div className="hbar" key={s}><span>{SOURCE_LABEL[s] ?? s}</span><i style={{ width: `${(n / maxSrc) * 100}%` }} /><span className="num muted">{n}</span></div>
            ))}
          </div>
        </div>
      </div>

      {open && <ReservationDrawer res={open} onClose={() => setOpen(null)} onChanged={load} />}
      {adding && <NewReservation onClose={() => setAdding(false)} onCreated={load} />}
    </>
  );
}
