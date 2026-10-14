import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import LoginForm from "../[slug]/host/login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard · Norix Booking", robots: { index: false, follow: false } };

export default async function DashboardHome() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return <div className="host"><LoginForm businessName="Norix Booking" /></div>;
  const { data: rows } = await sb.from("business_staff").select("business_id, businesses(slug)").limit(1);
  const slug = (rows?.[0] as unknown as { businesses?: { slug: string } } | undefined)?.businesses?.slug;
  if (slug) redirect(`/dashboard/${slug}`);
  return <div className="host"><LoginForm businessName="Norix Booking" notStaffEmail={user.email ?? ""} /></div>;
}
