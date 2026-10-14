import { notFound } from "next/navigation";
import { loadBusiness } from "@/lib/data";
import { fontHref, themeVars } from "@/lib/format";
import Booker from "./booker";

/** The public booking page, shared by /[slug] and /[slug]/[booking-link] */
export default async function BookingView({ slug, embed, experience }: { slug: string; embed?: string; experience?: string }) {
  const data = await loadBusiness(slug);
  if (!data) notFound();
  const { business, areas, tables, closedDates, experiences } = data;
  if (experience && !experiences.some((e) => e.slug === experience)) notFound();
  const vars = themeVars(business.theme ?? {});
  const href = fontHref(business.theme ?? {});
  const isEmbed = embed === "1";
  const pageBg = (business.theme?.mode ?? "dark") === "dark" ? "#0b0907" : "#f4f2ee";
  const exp = experiences.find((e) => e.slug === experience);

  return (
    <div className={`bk-page${isEmbed ? " embed" : ""}`} style={{ ...vars, ["--b-page" as string]: pageBg } as React.CSSProperties}>
      {href && <link rel="stylesheet" href={href} />}
      {!isEmbed && (
        <div className="bk-site">
          <small>{business.tagline || business.address || "Reservations"}</small>
          <b>{exp ? `${exp.name} at ${business.name}` : `Reserve a table at ${business.name}`}</b>
        </div>
      )}
      <Booker business={business} areas={areas} has3d={tables.some((t) => t.pos?.x !== undefined)} closedDates={closedDates}
        experiences={experience ? experiences.filter((e) => e.slug === experience) : experiences} initialExperience={experience} />
    </div>
  );
}
