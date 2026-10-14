"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Area, DiningTable } from "@/lib/types";
import { cedi } from "@/lib/format";
import { useDash } from "../../ctx";

type AreaForm = { id?: string; name: string; description: string; min_party: number; max_party: number; deposit_ghs: number; sort: number };
type TableForm = { id?: string; label: string; seats: number; area_id: string; shape: string; x: string; z: string };

/** Areas and tables: what guests choose from, and what the host screen and 3D view show */
export default function Seating() {
  const { sb, business, areas, tables, isManager, toast } = useDash();
  const router = useRouter();
  const [area, setArea] = useState<AreaForm | null>(null);
  const [table, setTable] = useState<TableForm | null>(null);
  const [err, setErr] = useState("");

  async function saveArea() {
    if (!area) return;
    if (!area.name.trim()) { setErr("Give the area a name."); return; }
    if (area.min_party > area.max_party) { setErr("Smallest party can’t be bigger than the largest."); return; }
    const row = { business_id: business.id, name: area.name.trim(), description: area.description.trim() || null, min_party: area.min_party, max_party: area.max_party, deposit_ghs: area.deposit_ghs, sort: area.sort };
    const { error } = area.id ? await sb.from("areas").update(row).eq("id", area.id) : await sb.from("areas").insert(row);
    if (error) { setErr(error.message); return; }
    setArea(null); setErr(""); toast("Area saved"); router.refresh();
  }
  async function deleteArea(a: AreaForm) {
    if (tables.some((t) => t.area_id === a.id)) { setErr("Move or delete this area’s tables first."); return; }
    const { error } = await sb.from("areas").delete().eq("id", a.id!);
    if (error) { setErr(error.message); return; }
    setArea(null); toast("Area deleted"); router.refresh();
  }
  async function saveTable() {
    if (!table) return;
    if (!table.label.trim() || !table.area_id || table.seats < 1) { setErr("Every table needs a name, an area and at least 1 seat."); return; }
    const pos: DiningTable["pos"] = { shape: table.shape as DiningTable["pos"]["shape"] };
    if (table.x !== "" && table.z !== "") { pos.x = Number(table.x); pos.z = Number(table.z); }
    const row = { label: table.label.trim(), seats: table.seats, area_id: table.area_id, pos };
    const { error } = table.id ? await sb.from("dining_tables").update(row).eq("id", table.id) : await sb.from("dining_tables").insert({ ...row, business_id: business.id });
    if (error) { setErr(error.message.includes("duplicate") ? "Another table already has that name." : error.message); return; }
    setTable(null); setErr(""); toast("Table saved"); router.refresh();
  }
  async function deleteTable(id: string) {
    const { error } = await sb.from("dining_tables").delete().eq("id", id);
    if (error) { setErr(error.message); return; }
    setTable(null); toast("Table deleted"); router.refresh();
  }

  if (!isManager) return <div className="notice">Only owners and managers can change seating.</div>;
  const seatsTotal = tables.reduce((s, t) => s + t.seats, 0);

  return (
    <>
      <div className="dash-head">
        <div><h1>Seating</h1><p>{areas.length} areas · {tables.length} tables · {seatsTotal} seats</p></div>
        <div className="row">
          <button className="btn ghost" onClick={() => { setArea({ name: "", description: "", min_party: 1, max_party: 8, deposit_ghs: 0, sort: areas.length + 1 }); setErr(""); }}>New area</button>
          <button className="btn" disabled={!areas.length} onClick={() => { setTable({ label: "", seats: 4, area_id: areas[0]?.id ?? "", shape: "round", x: "", z: "" }); setErr(""); }}>New table</button>
        </div>
      </div>
      {err && !area && !table && <div className="notice err">{err}</div>}

      {areas.map((a: Area) => {
        const ts = tables.filter((t) => t.area_id === a.id);
        return (
          <div className="card" key={a.id}>
            <div className="card-h">
              <div><b>{a.name}</b> <span className="muted">· {a.description || "No description"}</span></div>
              <div className="row">
                <span className="muted">Parties {a.min_party}–{a.max_party}{Number(a.deposit_ghs) > 0 ? ` · ${cedi(a.deposit_ghs)} deposit` : ""}</span>
                <button className="btn ghost sm" onClick={() => { setArea({ id: a.id, name: a.name, description: a.description ?? "", min_party: a.min_party, max_party: a.max_party, deposit_ghs: Number(a.deposit_ghs), sort: a.sort }); setErr(""); }}>Edit area</button>
              </div>
            </div>
            {!ts.length ? <div className="empty">No tables in this area yet.</div> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Table</th><th>Seats</th><th>Shape</th><th>3D position</th><th /></tr></thead>
                <tbody>{ts.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.label}</b></td><td className="num">{t.seats}</td><td>{t.pos?.shape ?? "—"}</td>
                    <td className="muted num">{typeof t.pos?.x === "number" ? `x ${t.pos.x}, z ${t.pos.z}` : "Not placed"}</td>
                    <td><button className="btn ghost sm" onClick={() => { setTable({ id: t.id, label: t.label, seats: t.seats, area_id: t.area_id, shape: t.pos?.shape ?? "round", x: t.pos?.x?.toString() ?? "", z: t.pos?.z?.toString() ?? "" }); setErr(""); }}>Edit</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        );
      })}

      {area && (
        <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) setArea(null); }}>
          <aside className="drawer" role="dialog" aria-label="Area">
            <div className="drawer-h"><h2>{area.id ? "Edit area" : "New area"}</h2><button className="btn ghost sm" onClick={() => setArea(null)}>Close</button></div>
            <div className="drawer-b">
              <div className="f"><label htmlFor="a-name">Name</label><input id="a-name" value={area.name} placeholder="Terrace" onChange={(e) => setArea({ ...area, name: e.target.value })} /></div>
              <div className="f"><label htmlFor="a-desc">What guests see</label><input id="a-desc" value={area.description} placeholder="Open air, under the lights" onChange={(e) => setArea({ ...area, description: e.target.value })} /></div>
              <div className="fgrid">
                <div className="f"><label htmlFor="a-min">Smallest party</label><input id="a-min" type="number" min={1} value={area.min_party} onChange={(e) => setArea({ ...area, min_party: Number(e.target.value) })} /></div>
                <div className="f"><label htmlFor="a-max">Largest party</label><input id="a-max" type="number" min={1} value={area.max_party} onChange={(e) => setArea({ ...area, max_party: Number(e.target.value) })} /></div>
                <div className="f"><label htmlFor="a-dep">Deposit (GH₵)</label><input id="a-dep" type="number" min={0} value={area.deposit_ghs} onChange={(e) => setArea({ ...area, deposit_ghs: Number(e.target.value) })} /><small>0 means no deposit</small></div>
                <div className="f"><label htmlFor="a-sort">Order on the booking page</label><input id="a-sort" type="number" value={area.sort} onChange={(e) => setArea({ ...area, sort: Number(e.target.value) })} /></div>
              </div>
              {err && <div className="notice err">{err}</div>}
              <div className="row between">
                {area.id ? <button className="btn danger" onClick={() => deleteArea(area)}>Delete area</button> : <span />}
                <button className="btn" onClick={saveArea}>Save area</button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {table && (
        <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) setTable(null); }}>
          <aside className="drawer" role="dialog" aria-label="Table">
            <div className="drawer-h"><h2>{table.id ? `Edit table ${table.label}` : "New table"}</h2><button className="btn ghost sm" onClick={() => setTable(null)}>Close</button></div>
            <div className="drawer-b">
              <div className="fgrid">
                <div className="f"><label htmlFor="t-label">Name</label><input id="t-label" value={table.label} placeholder="T11" onChange={(e) => setTable({ ...table, label: e.target.value })} /></div>
                <div className="f"><label htmlFor="t-seats">Seats</label><input id="t-seats" type="number" min={1} value={table.seats} onChange={(e) => setTable({ ...table, seats: Number(e.target.value) })} /></div>
                <div className="f"><label htmlFor="t-area">Area</label>
                  <select id="t-area" value={table.area_id} onChange={(e) => setTable({ ...table, area_id: e.target.value })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                </div>
                <div className="f"><label htmlFor="t-shape">Shape (for 3D)</label>
                  <select id="t-shape" value={table.shape} onChange={(e) => setTable({ ...table, shape: e.target.value })}>
                    <option value="round">Round</option><option value="rect">Rectangle</option><option value="long">Long banquet</option><option value="bar">Bar seats</option>
                  </select>
                </div>
                <div className="f"><label htmlFor="t-x">3D position across (x)</label><input id="t-x" type="number" step="0.1" value={table.x} onChange={(e) => setTable({ ...table, x: e.target.value })} /></div>
                <div className="f"><label htmlFor="t-z">3D position front-to-back (z)</label><input id="t-z" type="number" step="0.1" value={table.z} onChange={(e) => setTable({ ...table, z: e.target.value })} /></div>
              </div>
              <small className="muted">Positions are in metres from the middle of the room. Leave both empty to keep this table out of the 3D view.</small>
              {err && <div className="notice err">{err}</div>}
              <div className="row between">
                {table.id ? <button className="btn danger" onClick={() => deleteTable(table.id!)}>Delete table</button> : <span />}
                <button className="btn" onClick={saveTable}>Save table</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
