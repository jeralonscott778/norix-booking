"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm({ businessName, notStaffEmail }: { businessName: string; notStaffEmail?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(error.message === "Invalid login credentials" ? "That email and password don’t match a staff account." : error.message); return; }
    router.refresh();
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.refresh();
  }

  if (notStaffEmail) {
    return (
      <div className="host-login">
        <h1>No access yet</h1>
        <p className="host-muted">{notStaffEmail} is signed in but isn’t on the staff list for {businessName}. Ask the owner to add this email.</p>
        <button className="host-btn ghost" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <form className="host-login" onSubmit={signIn}>
      <h1>{businessName} · host screen</h1>
      <p className="host-muted">Staff only. Sign in to see and manage reservations.</p>
      <input type="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <div className="host-err" role="alert">{error}</div>}
      <button className="host-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
