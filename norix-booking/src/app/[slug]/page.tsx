import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBusiness } from "@/lib/data";
import { fontHref, themeVars } from "@/lib/format";
import Booker from "./booker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ embed?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadBusiness(slug);
  return { title: data ? `Reserve a table · ${data.business.name}` : "Reservations" };
}

export default async function BookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { embed } = await searchParams;
  const data = await loadBusiness(slug);
  if (!data) notFound();
  const { business, areas, tables } = data;
  const vars = themeVars(business.theme ?? {});
  const href = fontHref(business.theme ?? {});
  const isEmbed = embed === "1";
  const pageBg = (business.theme?.mode ?? "dark") === "dark" ? "#0b0907" : "#f4f2ee";

  return (
    <div className={`bk-page${isEmbed ? " embed" : ""}`} style={{ ...vars, ["--b-page" as string]: pageBg } as React.CSSProperties}>
      {href && <link rel="stylesheet" href={href} />}
      {!isEmbed && (
        <div className="bk-site">
          <small>{business.tagline || business.address || "Reservations"}</small>
          <b>Reserve a table at {business.name}</b>
        </div>
      )}
      <Booker business={business} areas={areas} has3d={tables.some((t) => t.pos?.x !== undefined)} />
    </div>
  );
}
