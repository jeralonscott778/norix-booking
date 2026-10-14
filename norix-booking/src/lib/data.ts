import { cache } from "react";
import { supabaseServer } from "./supabase/server";
import type { Area, Business, DiningTable, Experience } from "./types";

/** Loads a business and its seating by slug (public data only). */
export const loadBusiness = cache(async (slug: string) => {
  const sb = await supabaseServer();
  const { data: business } = await sb
    .from("businesses")
    .select("id,slug,name,tagline,address,phone,timezone,theme,settings")
    .eq("slug", slug)
    .maybeSingle<Business>();
  if (!business) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: business.timezone || "Africa/Accra" }).format(new Date());
  const [{ data: areas }, { data: tables }, { data: overrides }, { data: experiences }] = await Promise.all([
    sb.from("areas").select("id,name,description,min_party,max_party,deposit_ghs,sort").eq("business_id", business.id).order("sort"),
    sb.from("dining_tables").select("id,label,seats,status,area_id,pos").eq("business_id", business.id).order("label"),
    sb.from("date_overrides").select("day,closed").eq("business_id", business.id).gte("day", today),
    sb.from("experiences").select("*").eq("business_id", business.id).eq("active", true).order("sort"),
  ]);
  const closedDates = ((overrides ?? []) as { day: string; closed: boolean }[]).filter((o) => o.closed).map((o) => o.day);
  return { business, areas: (areas ?? []) as Area[], tables: (tables ?? []) as DiningTable[], closedDates, experiences: (experiences ?? []) as Experience[] };
});
