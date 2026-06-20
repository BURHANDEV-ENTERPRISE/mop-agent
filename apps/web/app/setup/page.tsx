"use client";
/**
 * Owner setup (Fasa 2). First run only: create the owner account.
 * Once an owner exists, the form locks (signups closed — single-owner self-host).
 */
import { useEffect, useState } from "react";
import { signUp, signIn } from "@/lib/auth-client";

export default function SetupPage() {
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d: { ownerExists: boolean }) => {
        setOwnerExists(d.ownerExists);
        setMode(d.ownerExists ? "signin" : "signup");
      })
      .catch(() => setOwnerExists(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("…");
    if (mode === "signup") {
      const res = await signUp.email({ email, password, name: name || email });
      setMsg(res.error ? `Error: ${res.error.message}` : "Owner created. You can sign in.");
      if (!res.error) setMode("signin");
    } else {
      const res = await signIn.email({ email, password });
      setMsg(res.error ? `Error: ${res.error.message}` : "Signed in ✓ → go to /");
      if (!res.error) window.location.href = "/";
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 24 }}>🧠 MOP-AGENT · Setup</h1>
      <p style={{ opacity: 0.7 }}>
        {ownerExists === null
          ? "…"
          : ownerExists
            ? "Owner exists — sign in."
            : "Create the owner account (first run)."}
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {mode === "signup" && (
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        )}
        <input
          placeholder="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Password (min 8)"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          {mode === "signup" ? "Create owner" : "Sign in"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 16, opacity: 0.85 }}>{msg}</p>}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #1f2a3a",
  background: "#111824",
  color: "#e6edf3",
};
const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #2b5cff",
  background: "#2b5cff",
  color: "white",
  cursor: "pointer",
};
