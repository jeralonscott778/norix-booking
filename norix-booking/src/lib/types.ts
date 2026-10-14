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
  min_notice_minutes?: number;
  slot_step_minutes?: number;
  requires_confirmation?: boolean;
  app_url?: string;
  owner_alerts?: boolean;
  questions?: Question[];
  weekly?: Record<string, Sitting[]>;
  payments?: "test" | "paystack";
  routing?: { enabled: boolean; rules: RoutingRule[] };
};

export type RoutingRule = {
  id: string;
  name: string;
  when: { occasion?: string; party_min?: number; party_max?: number; question_id?: string; answer?: string };
  recommend: { area_id?: string; experience?: string };
  message: string;
};

export type Experience = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_min: number | null;
  min_party: number;
  max_party: number;
  area_ids: string[];
  weekdays: number[];
  sitting_names: string[];
  deposit_fixed: number;
  deposit_per_guest: number;
  requires_confirmation: boolean | null;
  active: boolean;
  sort: number;
};

export type Question = { id: string; label: string; type: "text" | "select" | "checkbox"; required: boolean; options?: string[] };

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
  id?: string;
  manage_token?: string;
  ref: string;
  status: "held" | "pending" | "booked" | "waitlist" | "request";
  starts_at: string;
  party: number;
  table: string | null;
  area: string | null;
  deposit: number;
  waitlist_position: number | null;
  needs_payment?: boolean;
  experience?: string | null;
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
  status: "held" | "pending" | "booked" | "seated" | "finished" | "no_show" | "cancelled" | "waitlist" | "request" | "declined";
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
  guest_id?: string | null;
  internal_notes?: string | null;
  answers?: Record<string, string | boolean>;
  manage_token?: string;
  cancelled_by?: string | null;
  experience_id?: string | null;
  payment_ref?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
};

export type Guest = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  marketing_opt_in: boolean;
  created_at: string;
};

export type Workflow = {
  id: string;
  name: string;
  trigger: "booked" | "pending" | "confirmed" | "before_start" | "after_end" | "no_show" | "cancelled" | "rescheduled" | "waitlist" | "request";
  offset_minutes: number;
  channel: "email" | "sms" | "whatsapp";
  subject: string | null;
  body: string;
  active: boolean;
};

export type Message = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  detail: string | null;
  workflow_id: string | null;
  reservation_id: string | null;
  guest_id: string | null;
  created_at: string;
};

export type Staff = { business_id: string; email: string; role: "owner" | "manager" | "host"; created_at: string };
