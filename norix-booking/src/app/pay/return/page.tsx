import type { Metadata } from "next";
import Link from "next/link";
import { verifyPayment } from "../../[slug]/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

/** Paystack sends guests back here with ?reference=… */
export default async function PayReturn({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const reference = sp.reference || sp.trxref || "";
  const r = reference ? await verifyPayment(reference) : { ok: false, error: "No payment reference was given." };
  const ok = !!r.ok;
  return (
    <main className="home" style={{ background: "#0b0b0d" }}>
      <div className="home-in" style={{ textAlign: "center", alignItems: "center" }}>
        <div className="home-mark" aria-hidden style={{ background: ok ? "#4ade80" : "#f87171" }}>{ok ? "✓" : "!"}</div>
        <h1>{ok ? (r.status === "pending" ? "Paid. Waiting for the restaurant to confirm." : "Paid. Your table is booked.") : "Payment not completed"}</h1>
        <p>{ok ? `Reference ${r.ref}. Your confirmation is on its way to WhatsApp.` : r.error}</p>
        <div className="home-links" style={{ width: "100%" }}>
          {r.manage_token && <Link href={`/manage/${r.manage_token}`}>{ok ? "View or change your booking" : "Back to your booking"}</Link>}
        </div>
      </div>
    </main>
  );
}
