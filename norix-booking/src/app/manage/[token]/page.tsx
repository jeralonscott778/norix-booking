import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { fontHref, themeVars } from "@/lib/format";
import type { Business } from "@/lib/types";
import ManageBooking from "./manage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

export type ManagedBooking = {
  ref: string; status: string; starts_at: string; party: number; name: string; area: string | null; table: string | null;
  occasion: string | null; deposit: number; payment_status?: string; experience?: string | null; experience_slug?: string | null; business: Pick<Business, "slug" | "name" | "address" | "phone" | "timezone" | "theme" | "settings">;
};

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const sb = await supabaseServer();
  const { data } = await sb.rpc("get_booking", { p_token: token });
  if (!data) notFound();
  const booking = data as ManagedBooking;
  const theme = booking.business.theme ?? {};
  const href = fontHref(theme);
  return (
    <div className="bk-page" style={{ ...themeVars(theme), ["--b-page" as string]: (theme.mode ?? "dark") === "dark" ? "#0b0907" : "#f4f2ee" } as React.CSSProperties}>
      {href && <link rel="stylesheet" href={href} />}
      <ManageBooking token={token} booking={booking} />
    </div>
  );
}
