"use server";

import { headers } from "next/headers";
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
  answers?: Record<string, string | boolean>;
  experience?: string | null;
};

export async function bookTable(input: BookingInput): Promise<{ ok: true; result: BookingResult } | { ok: false; error: string }> {
  const sb = await supabaseServer();
  // Confirmations are sent automatically by the database (Automations), so nothing else to call here.
  const { data, error } = await sb.rpc("make_booking", {
    p_slug: input.slug,
    p: {
      day: input.day, time: input.time, party: input.party, area_id: input.areaId, table_id: input.tableId ?? null,
      name: input.name, phone: input.phone, email: input.email || null, occasion: input.occasion, dietary: input.dietary,
      high_chair: input.highChair, notes: input.notes || null, payment_method: input.paymentMethod, waitlist: input.waitlist,
      answers: input.answers ?? {}, experience: input.experience ?? null,
    },
  });
  if (error) return { ok: false, error: error.message || "Something went wrong. Please try again." };
  return { ok: true, result: data as BookingResult };
}

export async function manageCancel(token: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cancel_booking", { p_token: token });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function manageReschedule(token: string, day: string, time: string) {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("reschedule_booking", { p_token: token, p_day: day, p_time: time });
  return error ? { ok: false as const, error: error.message } : { ok: true as const, result: data as { starts_at: string; table: string } };
}

async function callPayments(body: Record<string, unknown>) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return (await r.json().catch(() => ({ error: "Payment service did not answer." }))) as Record<string, unknown>;
}

/** Starts Paystack checkout for a held booking */
export async function startPayment(ref: string, token: string) {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const j = await callPayments({ action: "init", ref, token, origin });
  return j.url ? { ok: true as const, url: String(j.url) } : { ok: false as const, error: String(j.error ?? "Could not start the payment.") };
}

/** Checks a payment after the guest comes back from Paystack */
export async function verifyPayment(reference: string) {
  return (await callPayments({ action: "verify", reference })) as { ok?: boolean; error?: string; ref?: string; status?: string; manage_token?: string };
}
