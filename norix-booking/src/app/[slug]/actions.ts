"use server";

import { supabaseServer } from "@/lib/supabase/server";
import type { BookingResult } from "@/lib/types";

export type BookingInput = {
  slug: string;
  day: string;
  time: string;
  party: number;
  areaId: string | null;
  tableId?: string | null;
  name: string;
  phone: string;
  email: string;
  occasion: string;
  dietary: string[];
  highChair: boolean;
  notes: string;
  paymentMethod: string | null;
  waitlist: boolean;
};

export async function bookTable(input: BookingInput): Promise<{ ok: true; result: BookingResult } | { ok: false; error: string }> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("create_booking", {
    p_slug: input.slug,
    p_day: input.day,
    p_time: input.time,
    p_party: input.party,
    p_area: input.areaId,
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email || null,
    p_occasion: input.occasion,
    p_dietary: input.dietary,
    p_high_chair: input.highChair,
    p_notes: input.notes || null,
    p_payment_method: input.paymentMethod,
    p_waitlist: input.waitlist,
    p_table: input.tableId ?? null,
  });
  if (error) return { ok: false, error: error.message || "Something went wrong. Please try again." };
  const result = data as BookingResult;

  // Send WhatsApp / SMS / email confirmations. A failure here never blocks the booking.
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: result.ref }),
      cache: "no-store",
    });
  } catch {
    /* confirmations are best effort */
  }
  return { ok: true, result };
}
