"use client";

import { useEffect, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

export default function SetupPage() {
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  useEffect(() => {
    Promise.all([
      fetch("/api/setup/status").then((r) => r.json()) as Promise<{ ownerExists: boolean }>,
      fetch("/api/me"),
    ])
      .then(([status, me]) => {
        if (me.ok) {
          window.location.replace("/assistant");
          return;
        }
        setOwnerExists(status.ownerExists);
        setMode(status.ownerExists ? "signin" : "signup");
      })
      .catch(() => setMsg("Unable to reach MOP-AGENT. Please refresh."));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");

    if (mode === "signup") {
      const res = await signUp.email({ email, password, name: name.trim() || email });
      if (res.error) {
        setMsg(res.error.message ?? "Account setup failed.");
        setBusy(false);
        return;
      }
      // Better Auth creates the first session together with the owner account.
      window.location.replace("/assistant");
      return;
    }

    const res = await signIn.email({ email, password });
    if (res.error) {
      setMsg(res.error.message ?? "Sign in failed.");
      setBusy(false);
      return;
    }
    window.location.replace("/assistant");
  }

  const loading = ownerExists === null && !msg;

  return (
    <main style={shell}>
      <section style={brandPanel}>
        <div style={logo}>M</div>
        <p style={eyebrow}>SELF-HOSTED AI ASSISTANT</p>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.05, margin: "12px 0 18px" }}>
          Your assistant.<br />Your server. Your memory.
        </h1>
        <p style={{ color: "#9aa8bd", fontSize: 17, lineHeight: 1.7, maxWidth: 520 }}>
          MOP-AGENT gives you one private assistant across your projects. Brain is the memory layer behind it—not the first hurdle.
        </p>
        <div style={featureRow}>
          <span>◆ Private</span><span>◆ Persistent memory</span><span>◆ Cross-project</span>
        </div>
      </section>

      <section style={formWrap}>
        <div style={formCard}>
          <p style={eyebrow}>{mode === "signup" ? "FIRST-RUN SETUP" : "WELCOME BACK"}</p>
          <h2 style={{ fontSize: 27, margin: "8px 0" }}>
            {loading ? "Checking server…" : mode === "signup" ? "Create Admin account" : "Sign in to MOP-AGENT"}
          </h2>
          <p style={{ color: "#8c9bb0", lineHeight: 1.55, marginTop: 0 }}>
            {mode === "signup"
              ? "This first account controls providers, team access, projects, and system memory."
              : "Use your Admin or invited team account."}
          </p>

          {!loading && (
            <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 28 }}>
              {mode === "signup" && (
                <label style={label}>Display name
                  <input placeholder="Admin" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                </label>
              )}
              <label style={label}>Email
                <input placeholder="admin@example.com" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              </label>
              <label style={label}>Password
                <input placeholder="Minimum 8 characters" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              </label>
              <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.65 : 1 }}>
                {busy ? "Please wait…" : mode === "signup" ? "Create Admin & continue" : "Sign in"}
              </button>
            </form>
          )}

          {msg && <p role="alert" style={{ marginTop: 16, color: "#ff9b9b" }}>{msg}</p>}

          {!loading && (
            <p style={{ marginTop: 22, fontSize: 13, color: "#7f8da2" }}>
              {mode === "signin" ? "Invited team member? " : "Already created an account? "}
              <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(""); }} style={textButton}>
                {mode === "signin" ? "Create invited account" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

const shell: React.CSSProperties = { minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(380px, .75fr)", background: "radial-gradient(circle at 18% 12%, #17233c 0, #0b0f17 36%, #080b11 100%)" };
const brandPanel: React.CSSProperties = { padding: "clamp(48px, 8vw, 110px)", display: "flex", flexDirection: "column", justifyContent: "center" };
const formWrap: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 28, background: "rgba(5, 8, 13, .58)", borderLeft: "1px solid #1b2637" };
const formCard: React.CSSProperties = { width: "min(100%, 430px)", padding: "38px 34px", border: "1px solid #243149", borderRadius: 18, background: "rgba(13, 19, 30, .94)", boxShadow: "0 24px 80px rgba(0,0,0,.35)" };
const logo: React.CSSProperties = { width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg, #4f7cff, #8f5cff)", boxShadow: "0 10px 32px rgba(79,124,255,.32)" };
const eyebrow: React.CSSProperties = { margin: "20px 0 0", color: "#7d9dff", fontSize: 12, fontWeight: 800, letterSpacing: ".16em" };
const featureRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 20, color: "#8695aa", fontSize: 13, marginTop: 34 };
const label: React.CSSProperties = { display: "grid", gap: 7, color: "#bac6d8", fontSize: 13, fontWeight: 650 };
const inputStyle: React.CSSProperties = { padding: "12px 13px", borderRadius: 9, border: "1px solid #2a3951", outline: "none", background: "#0c121d", color: "#eef3fa", fontSize: 15 };
const buttonStyle: React.CSSProperties = { marginTop: 4, padding: "12px 14px", borderRadius: 9, border: "1px solid #5278ff", background: "linear-gradient(135deg, #416cff, #6d54e8)", color: "white", fontWeight: 750, fontSize: 15, cursor: "pointer" };
const textButton: React.CSSProperties = { padding: 0, border: 0, background: "none", color: "#85a1ff", cursor: "pointer" };
