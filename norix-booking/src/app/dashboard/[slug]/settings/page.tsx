"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Staff, Theme } from "@/lib/types";
import { useDash } from "../../ctx";

const FONTS = ["Playfair Display", "Manrope", "Cormorant Garamond", "Jost", "DM Serif Display", "DM Sans", "IBM Plex Sans", "Geist", "Fraunces", "Inter"];

/** Business profile, branding, team, and embed codes */
export default function SettingsPage() {
  const { sb, business, role, isManager, email, toast } = useDash();
  const router = useRouter();
  const [p, setP] = useState({ name: business.name, tagline: business.tagline ?? "", address: business.address ?? "", phone: business.phone ?? "",
    app_url: business.settings.app_url ?? "", owner_alerts: business.settings.owner_alerts !== false });
  const [t, setT] = useState<Theme>({ accent: "#C9A45C", mode: "dark", head: "Playfair Display", body: "Manrope", radius: 8, ...business.theme });
  const [team, setTeam] = useState<Staff[]>([]);
  const [invite, setInvite] = useState({ email: "", role: "host" as Staff["role"] });
  const [err, setErr] = useState("");
  const [origin, setOrigin] = useState("");

  const loadTeam = useCallback(async () => {
    const { data } = await sb.from("business_staff").select("*").eq("business_id", business.id).order("created_at");
    setTeam((data ?? []) as Staff[]);
  }, [sb, business.id]);
  useEffect(() => { loadTeam(); setOrigin(window.location.origin); }, [loadTeam]);

  async function saveProfile() {
    const url = p.app_url.trim().replace(/\/$/, "");
    if (url && !/^https:\/\//.test(url)) { setErr("The app address must start with https://"); return; }
    const { error } = await sb.from("businesses").update({
      name: p.name.trim(), tagline: p.tagline.trim() || null, address: p.address.trim() || null, phone: p.phone.trim() || null,
      settings: { ...business.settings, app_url: url, owner_alerts: p.owner_alerts },
    }).eq("id", business.id);
    if (error) { setErr(error.message); return; }
    setErr(""); toast("Business details saved"); router.refresh();
  }
  async function saveTheme() {
    const { error } = await sb.from("businesses").update({ theme: t }).eq("id", business.id);
    if (error) { setErr(error.message); return; }
    setErr(""); toast("Branding saved. The booking page now uses it."); router.refresh();
  }
  async function addStaff() {
    const e = invite.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setErr("Enter a valid email."); return; }
    const { error } = await sb.from("business_staff").insert({ business_id: business.id, email: e, role: invite.role });
    if (error) { setErr(error.message.includes("duplicate") ? "That person is already on the team." : error.message); return; }
    setInvite({ email: "", role: "host" }); setErr(""); toast("Added to the team"); loadTeam();
  }
  async function removeStaff(s: Staff) {
    if (s.email.toLowerCase() === email.toLowerCase()) { setErr("You can’t remove yourself."); return; }
    const { error } = await sb.from("business_staff").delete().eq("business_id", business.id).eq("email", s.email);
    if (error) { setErr(error.message); return; }
    toast("Removed from the team"); loadTeam();
  }

  const base = (p.app_url.trim().replace(/\/$/, "") || origin);
  const embedUrl = `${base}/${business.slug}?embed=1`;

  return (
    <>
      <div className="dash-head"><div><h1>Settings</h1><p>Business details, branding, team and embed codes.</p></div></div>
      {err && <div className="notice err">{err}</div>}

      <div className="grid2">
        <div className="card">
          <div className="card-h"><b>Business details</b>{isManager && <button className="btn sm" onClick={saveProfile}>Save</button>}</div>
          <div className="card-b">
            <div className="f"><label htmlFor="s-name">Name</label><input id="s-name" disabled={!isManager} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
            <div className="f"><label htmlFor="s-tag">Tagline</label><input id="s-tag" disabled={!isManager} value={p.tagline} onChange={(e) => setP({ ...p, tagline: e.target.value })} /></div>
            <div className="f"><label htmlFor="s-addr">Address</label><input id="s-addr" disabled={!isManager} value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} /></div>
            <div className="f"><label htmlFor="s-phone">Phone shown to guests</label><input id="s-phone" disabled={!isManager} value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></div>
            <div className="f"><label htmlFor="s-url">App address</label><input id="s-url" disabled={!isManager} placeholder="https://norix-booking.vercel.app" value={p.app_url} onChange={(e) => setP({ ...p, app_url: e.target.value })} />
              <small>Your Vercel link. Messages use it for the “change or cancel” link.</small></div>
            <label className="check"><input type="checkbox" disabled={!isManager} checked={p.owner_alerts} onChange={(e) => setP({ ...p, owner_alerts: e.target.checked })} />WhatsApp the restaurant about every new booking</label>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><b>Branding</b>{isManager && <button className="btn sm" onClick={saveTheme}>Save</button>}</div>
          <div className="card-b">
            <div className="fgrid">
              <div className="f"><label htmlFor="b-acc">Brand colour</label><input id="b-acc" type="color" disabled={!isManager} value={t.accent} onChange={(e) => setT({ ...t, accent: e.target.value })} style={{ height: 38, padding: 2 }} /></div>
              <div className="f"><label htmlFor="b-mode">Look</label>
                <select id="b-mode" disabled={!isManager} value={t.mode} onChange={(e) => setT({ ...t, mode: e.target.value as Theme["mode"] })}><option value="dark">Dark</option><option value="light">Light</option></select></div>
              <div className="f"><label htmlFor="b-head">Heading font</label>
                <select id="b-head" disabled={!isManager} value={t.head} onChange={(e) => setT({ ...t, head: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></div>
              <div className="f"><label htmlFor="b-body">Text font</label>
                <select id="b-body" disabled={!isManager} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></div>
              <div className="f"><label htmlFor="b-rad">Corners</label>
                <select id="b-rad" disabled={!isManager} value={t.radius} onChange={(e) => setT({ ...t, radius: Number(e.target.value) })}><option value={2}>Sharp</option><option value={8}>Soft</option><option value={16}>Round</option></select></div>
            </div>
            <small className="muted">Match these to the restaurant’s website so the booking page feels like part of it.</small>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><b>Team</b><span className="muted">Owners manage everything. Managers change hours, seating and messages. Hosts handle reservations and guests.</span></div>
        <div className="card-b">
          <div className="tbl-wrap"><table className="tbl"><tbody>
            {team.map((s) => (
              <tr key={s.email}>
                <td>{s.email}{s.email.toLowerCase() === email.toLowerCase() && <span className="muted"> (you)</span>}</td>
                <td><span className="pill">{s.role}</span></td>
                <td>{role === "owner" && s.email.toLowerCase() !== email.toLowerCase() && <button className="btn ghost sm" onClick={() => removeStaff(s)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody></table></div>
          {role === "owner" && (
            <>
              <div className="row">
                <input className="inp" style={{ maxWidth: 280 }} placeholder="name@example.com" aria-label="Staff email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                <select className="inp" style={{ maxWidth: 140 }} aria-label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Staff["role"] })}>
                  <option value="host">Host</option><option value="manager">Manager</option><option value="owner">Owner</option>
                </select>
                <button className="btn" onClick={addStaff}>Add to team</button>
              </div>
              <small className="muted">After adding someone, create their login in Supabase → Authentication → Users → Add user, with the same email.</small>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><b>Put booking on the website</b></div>
        <div className="card-b">
          <div className="f"><label>Framer: Embed component → URL</label><div className="code">{embedUrl}</div></div>
          <div className="f"><label>Any website: paste this HTML</label>
            <div className="code">{`<iframe src="${embedUrl}" style="width:100%;height:900px;border:0" title="Reserve a table at ${business.name}" loading="lazy"></iframe>`}</div></div>
          <div className="f"><label>Direct link (Instagram bio, WhatsApp, QR code)</label><div className="code">{`${base}/${business.slug}`}</div></div>
          <div className="f"><label>3D seat view</label><div className="code">{`${base}/${business.slug}/3d`}</div></div>
        </div>
      </div>
    </>
  );
}
