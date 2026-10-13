import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBusiness } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import HostBoard from "./host-board";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Host screen", robots: { index: false, follow: false } };

export default async function HostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadBusiness(slug);
  if (!data) notFound();
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return <div className="host"><LoginForm businessName={data.business.name} /></div>;
  }
  const { data: allowed } = await sb.rpc("is_staff", { p_business: data.business.id });
  if (!allowed) {
    return (
      <div className="host">
        <LoginForm businessName={data.business.name} notStaffEmail={user.email ?? ""} />
      </div>
    );
  }
  return (
    <div className="host">
      <HostBoard business={data.business} areas={data.areas} initialTables={data.tables} userEmail={user.email ?? ""} />
    </div>
  );
}
