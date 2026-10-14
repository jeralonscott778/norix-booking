"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const NAV: [string, string, boolean][] = [
  ["", "Overview", false],
  ["/reservations", "Reservations", false],
  ["/booking-links", "Booking links", false],
  ["/guests", "Guests", false],
  ["/messages", "Messages", false],
  ["/automations", "Automations", false],
  ["/routing", "Seat routing", true],
  ["/availability", "Opening hours & rules", true],
  ["/seating", "Seating", true],
  ["/booking-form", "Booking form", true],
  ["/apps", "Apps", false],
  ["/settings", "Settings", false],
];

export default function Sidebar({ slug, name, role }: { slug: string; name: string; role: string }) {
  const path = usePathname();
  const router = useRouter();
  const base = `/dashboard/${slug}`;
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.refresh();
  }
  return (
    <nav className="dash-side" aria-label="Dashboard">
      <div className="dash-biz">{name}<small>{role === "owner" ? "Owner" : role === "manager" ? "Manager" : "Host"}</small></div>
      {NAV.filter(([, , managerOnly]) => !managerOnly || role !== "host").map(([href, label]) => (
        <Link key={href} href={base + href} aria-current={path === base + href ? "page" : undefined}>{label}</Link>
      ))}
      <div className="sp" />
      <Link href={`/${slug}/host`}>Host screen ↗</Link>
      <Link href={`/${slug}`} target="_blank">Booking page ↗</Link>
      <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</a>
    </nav>
  );
}
