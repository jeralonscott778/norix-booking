import type { Metadata } from "next";
import { loadBusiness } from "@/lib/data";
import BookingView from "./booking-view";

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
  return <BookingView slug={slug} embed={embed} />;
}
