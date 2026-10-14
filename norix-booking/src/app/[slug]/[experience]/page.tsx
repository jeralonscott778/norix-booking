import type { Metadata } from "next";
import { loadBusiness } from "@/lib/data";
import BookingView from "../booking-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; experience: string }>; searchParams: Promise<{ embed?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, experience } = await params;
  const data = await loadBusiness(slug);
  const exp = data?.experiences.find((e) => e.slug === experience);
  return { title: data && exp ? `${exp.name} · ${data.business.name}` : "Reservations" };
}

/** One booking link, e.g. /kozo/birthday */
export default async function ExperiencePage({ params, searchParams }: Props) {
  const { slug, experience } = await params;
  const { embed } = await searchParams;
  return <BookingView slug={slug} embed={embed} experience={experience} />;
}
