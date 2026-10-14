"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Area, Business, DiningTable, Reservation } from "@/lib/types";

type Ctx = {
  business: Business;
  areas: Area[];
  tables: DiningTable[];
  role: "owner" | "manager" | "host";
  email: string;
  isManager: boolean;
  sb: ReturnType<typeof supabaseBrowser>;
  toast: (msg: string) => void;
};

const DashCtx = createContext<Ctx | null>(null);

export function DashProvider(props: Omit<Ctx, "sb" | "toast" | "isManager"> & { children: React.ReactNode }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [msg, setMsg] = useState("");
  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3500); }, []);
  const { children, ...rest } = props;
  const value: Ctx = { ...rest, sb, toast, isManager: rest.role === "owner" || rest.role === "manager" };
  return (
    <DashCtx.Provider value={value}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </DashCtx.Provider>
  );
}

export function useDash() {
  const c = useContext(DashCtx);
  if (!c) throw new Error("useDash outside dashboard");
  return c;
}

export const STATUS_LABEL: Record<Reservation["status"], [string, string]> = {
  held: ["", "Awaiting payment"], pending: ["warn", "Needs confirming"], booked: ["info", "Booked"], seated: ["warn", "Seated"], finished: ["ok", "Finished"],
  no_show: ["bad", "No-show"], cancelled: ["", "Cancelled"], waitlist: ["warn", "Waitlist"], request: ["warn", "Group request"],
  declined: ["bad", "Declined"],
};
export const SOURCE_LABEL: Record<string, string> = {
  web: "Website", phone: "Phone", walk_in: "Walk-in", whatsapp: "WhatsApp", ai_receptionist: "AI receptionist", instagram: "Instagram",
};
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Calls a Supabase edge function as the signed-in staff member */
export async function callFunction<T>(sb: Ctx["sb"], name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) { const j = await ctx.json(); message = j.error || message; }
    } catch {}
    throw new Error(message);
  }
  return data as T;
}
