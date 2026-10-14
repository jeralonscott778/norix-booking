import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBusiness } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import LoginForm from "../../[slug]/host/login-form";
import { DashProvider } from "../ctx";
import Sidebar from "./sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard · Norix Booking", robots: { index: false, follow: false } };

export default async function DashLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadBusiness(slug);
  if (!data) notFound();
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return <div className="host"><LoginForm businessName={data.business.name} /></div>;
  const { data: role } = await sb.rpc("staff_role", { p_business: data.business.id });
  if (!role) return <div className="host"><LoginForm businessName={data.business.name} notStaffEmail={user.email ?? ""} /></div>;

  return (
    <DashProvider business={data.business} areas={data.areas} tables={data.tables} role={role} email={user.email ?? ""}>
      <div className="dash">
        <Sidebar slug={slug} name={data.business.name} role={role} />
        <main className="dash-main">{children}</main>
      </div>
    </DashProvider>
  );
}
