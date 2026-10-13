export type Theme = {
  accent?: string;
  mode?: "dark" | "light";
  head?: string;
  body?: string;
  radius?: number;
  surface?: string;
  text?: string;
};

export type Sitting = { name: string; from: string; last: string };

export type Settings = {
  sittings?: Sitting[];
  closed_days?: number[];
  seat_minutes?: number;
  max_online_party?: number;
  group_deposit_from?: number;
  group_deposit_per_head?: number;
  ref_prefix?: string;
  hold_minutes?: number;
  cancel_hours?: number;
  book_ahead_days?: number;
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  theme: Theme;
  settings: Settings;
};

export type Area = {
  id: string;
  name: string;
  description: string | null;
  min_party: number;
  max_party: number;
  deposit_ghs: number;
  sort: number;
};

export type DiningTable = {
  id: string;
  label: string;
  seats: number;
  status: "free" | "seated" | "clearing";
  area_id: string;
  pos: { x?: number; z?: number; shape?: "round" | "rect" | "long" | "bar" };
};

export type Slot = { slot: string; sitting: string; area_ids: string[] };

export type BookingResult = {
  ref: string;
  status: "booked" | "waitlist" | "request";
  starts_at: string;
  party: number;
  table: string | null;
  area: string | null;
  deposit: number;
  waitlist_position: number | null;
};

export type Reservation = {
  id: string;
  ref: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  party_size: number;
  starts_at: string;
  duration_min: number;
  status: "booked" | "seated" | "finished" | "no_show" | "cancelled" | "waitlist" | "request";
  occasion: string | null;
  dietary: string[];
  high_chair: boolean;
  notes: string | null;
  deposit_ghs: number;
  payment_status: string;
  source: string;
  table_id: string | null;
  area_id: string | null;
  created_at: string;
};
