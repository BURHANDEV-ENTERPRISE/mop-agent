"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";

type SetupStatus = { authenticated: boolean };

async function waitForSession(): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`/api/setup/status?t=${Date.now()}`, { cache: "no-store", credentials: "include" });
      const status = await response.json() as SetupStatus;
      if (status.authenticated) return true;
    } catch {
      // Retry a short proxy/session propagation gap.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const result = await signIn.email({ email, password });
    if (result.error) {
      setMsg(result.error.message ?? "Sign in failed.");
      setBusy(false);
      return;
    }
    if (await waitForSession()) {
      window.location.replace(`/assistant?auth=${Date.now()}`);
      return;
    }
    setMsg("Sign in succeeded, but the session cookie was not accepted. Use the configured domain and HTTPS address.");
    setBusy(false);
  }

  return (
    <main className="mop-setup-shell" style={shell}>
      <section className="mop-setup-brand" style={brandPanel}>
        <img src="/icon.svg" alt="MOP-AGENT" style={heroLogo} />
      </section>
      <section className="mop-setup-form" style={formWrap}>
        <div style={formCard}>
          <p style={eyebrow}>WELCOME BACK</p>
          <h1 style={{ fontSize: 27, margin: "8px 0" }}>Sign in to MOP-AGENT</h1>
          <p style={description}>Use the account created for you by the Administrator.</p>
          <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 28 }}>
            <label style={label}>Email
              <input placeholder="you@example.com" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </label>
            <label style={label}>Password
              <input placeholder="Your password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            </label>
            <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.65 : 1 }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {msg && <p role="alert" style={{ marginTop: 16, color: "#742220" }}>{msg}</p>}
        </div>
      </section>
    </main>
  );
}

const shell: React.CSSProperties = { minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(380px, .75fr)", background: "#fef9e1" };
const brandPanel: React.CSSProperties = { padding: "clamp(48px, 8vw, 110px)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "radial-gradient(circle at 50% 45%, #49685c 0, #2d4a3e 58%, #21382f 100%)" };
const heroLogo: React.CSSProperties = { display: "block", width: "min(72%, 560px)", height: "auto", maxHeight: "72vh", objectFit: "contain", filter: "drop-shadow(0 24px 34px rgba(0,0,0,.28))" };
const formWrap: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 28, background: "#fef9e1", borderLeft: "1px solid #2d4a3e" };
const formCard: React.CSSProperties = { width: "min(100%, 430px)", padding: "38px 34px", border: "1px solid rgba(45,74,62,.45)", borderRadius: 18, background: "#fffdf2", boxShadow: "0 24px 70px rgba(45,74,62,.14)" };
const eyebrow: React.CSSProperties = { margin: "20px 0 0", color: "#742220", fontSize: 12, fontWeight: 800, letterSpacing: ".16em" };
const description: React.CSSProperties = { color: "#7f8da2", lineHeight: 1.55, marginTop: 0 };
const label: React.CSSProperties = { display: "grid", gap: 7, color: "#2d4a3e", fontSize: 13, fontWeight: 650 };
const inputStyle: React.CSSProperties = { padding: "12px 13px", borderRadius: 9, border: "1px solid rgba(45,74,62,.42)", outline: "none", background: "#fef9e1", color: "#2d4a3e", fontSize: 15 };
const buttonStyle: React.CSSProperties = { marginTop: 4, padding: "12px 14px", borderRadius: 9, border: "1px solid #742220", background: "#742220", color: "#fef9e1", fontWeight: 750, fontSize: 15, cursor: "pointer" };
