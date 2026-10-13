import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBusiness } from "@/lib/data";
import { fontHref, themeVars } from "@/lib/format";
import SeatView from "./seat-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ day?: string; party?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadBusiness(slug);
  return { title: data ? `3D seat view · ${data.business.name}` : "3D seat view" };
}

export default async function SeatViewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await loadBusiness(slug);
  if (!data) notFound();
  const href = fontHref(data.business.theme ?? {});
  const party = Math.min(8, Math.max(1, Number(sp.party) || 2));
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : undefined;
  return (
    <div style={themeVars(data.business.theme ?? {}) as React.CSSProperties}>
      {href && <link rel="stylesheet" href={href} />}
      <SeatView business={data.business} areas={data.areas} tables={data.tables} initialDay={day} initialParty={party} />
    </div>
  );
}
