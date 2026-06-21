"use client";

import { useEffect, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

type SetupStatus = { ownerExists: boolean; authenticated: boolean };

async function getSetupStatus(): Promise<SetupStatus> {
  const response = await fetch(`/api/setup/status?t=${Date.now()}`, {
    cache: "no-store",
    credentials: "include",
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`setup status ${response.status}`);
  return response.json() as Promise<SetupStatus>;
}

async function waitForSession(): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if ((await getSetupStatus()).authenticated) return true;
    } catch {
      // A short deployment/network gap should not strand the form in busy mode.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export default function SetupPage() {
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  useEffect(() => {
    getSetupStatus()
      .then((status) => {
        if (status.authenticated) {
          window.location.replace(`/assistant?auth=${Date.now()}`);
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
      // Verify the cookie before entering a server-protected route. If the
      // signup response did not establish it, explicitly sign in once.
      if (!(await waitForSession())) {
        const login = await signIn.email({ email, password });
        if (login.error) {
          setMode("signin");
          setOwnerExists(true);
          setMsg(login.error.message ?? "Admin created, but sign in failed. Please sign in below.");
          setBusy(false);
          return;
        }
      }
      if (await waitForSession()) {
        window.location.replace(`/assistant?auth=${Date.now()}`);
        return;
      }
      setMode("signin");
      setOwnerExists(true);
      setMsg("Admin created, but the session cookie was not accepted. Please sign in again.");
      setBusy(false);
      return;
    }

    const res = await signIn.email({ email, password });
    if (res.error) {
      setMsg(res.error.message ?? "Sign in failed.");
      setBusy(false);
      return;
    }
    if (await waitForSession()) {
      window.location.replace(`/assistant?auth=${Date.now()}`);
      return;
    }
    setMsg("Sign in succeeded, but the session cookie was not accepted. Check that you are using the configured HTTPS domain.");
    setBusy(false);
  }

  const loading = ownerExists === null && !msg;

  return (
    <main className="mop-setup-shell" style={shell}>
      <section className="mop-setup-brand" style={brandPanel}>
        <img src="/icon.svg" alt="MOP-AGENT" style={heroLogo} />
      </section>

      <section className="mop-setup-form" style={formWrap}>
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

          {msg && <p role="alert" style={{ marginTop: 16, color: "#742220" }}>{msg}</p>}

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

const shell: React.CSSProperties = { minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(380px, .75fr)", background: "#fef9e1" };
const brandPanel: React.CSSProperties = { padding: "clamp(48px, 8vw, 110px)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "radial-gradient(circle at 50% 45%, #49685c 0, #2d4a3e 58%, #21382f 100%)" };
const heroLogo: React.CSSProperties = { display: "block", width: "min(72%, 560px)", height: "auto", maxHeight: "72vh", objectFit: "contain", filter: "drop-shadow(0 24px 34px rgba(0,0,0,.28))" };
const formWrap: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 28, background: "#fef9e1", borderLeft: "1px solid #2d4a3e" };
const formCard: React.CSSProperties = { width: "min(100%, 430px)", padding: "38px 34px", border: "1px solid rgba(45,74,62,.45)", borderRadius: 18, background: "#fffdf2", boxShadow: "0 24px 70px rgba(45,74,62,.14)" };
const eyebrow: React.CSSProperties = { margin: "20px 0 0", color: "#742220", fontSize: 12, fontWeight: 800, letterSpacing: ".16em" };
const label: React.CSSProperties = { display: "grid", gap: 7, color: "#2d4a3e", fontSize: 13, fontWeight: 650 };
const inputStyle: React.CSSProperties = { padding: "12px 13px", borderRadius: 9, border: "1px solid rgba(45,74,62,.42)", outline: "none", background: "#fef9e1", color: "#2d4a3e", fontSize: 15 };
const buttonStyle: React.CSSProperties = { marginTop: 4, padding: "12px 14px", borderRadius: 9, border: "1px solid #742220", background: "#742220", color: "#fef9e1", fontWeight: 750, fontSize: 15, cursor: "pointer" };
const textButton: React.CSSProperties = { padding: 0, border: 0, background: "none", color: "#742220", cursor: "pointer" };
