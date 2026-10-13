import { cache } from "react";
import { supabaseServer } from "./supabase/server";
import type { Area, Business, DiningTable } from "./types";

/** Loads a business and its seating by slug (public data only). */
export const loadBusiness = cache(async (slug: string) => {
  const sb = await supabaseServer();
  const { data: business } = await sb
    .from("businesses")
    .select("id,slug,name,tagline,address,phone,timezone,theme,settings")
    .eq("slug", slug)
    .maybeSingle<Business>();
  if (!business) return null;
  const [{ data: areas }, { data: tables }] = await Promise.all([
    sb.from("areas").select("id,name,description,min_party,max_party,deposit_ghs,sort").eq("business_id", business.id).order("sort"),
    sb.from("dining_tables").select("id,label,seats,status,area_id,pos").eq("business_id", business.id).order("label"),
  ]);
  return { business, areas: (areas ?? []) as Area[], tables: (tables ?? []) as DiningTable[] };
});
