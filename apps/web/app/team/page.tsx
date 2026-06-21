"use client";
/** Team — your role, members, and (owner) invite management. */
import { useEffect, useState } from "react";

type Me = { user: { email: string; name: string }; role: string };
type Member = { id: string; email: string; name: string; role: string };
type Invite = { email: string; role: string; expiresAt: number; usedAt: number | null };

export default function TeamPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [msg, setMsg] = useState("");

  const isOwner = me?.role === "owner";

  function load() {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
    fetch("/api/members").then((r) => (r.ok ? r.json() : { members: [] })).then((d) => setMembers(d.members ?? [])).catch(() => {});
    fetch("/api/invites").then((r) => (r.ok ? r.json() : { invites: [] })).then((d) => setInvites(d.invites ?? [])).catch(() => {});
  }
  useEffect(load, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMsg("…");
    const r = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
    setMsg(r.ok ? `✅ invited ${email}` : `error ${r.status}`);
    setEmail("");
    load();
  }

  async function revoke(em: string) {
    await fetch(`/api/invites?email=${encodeURIComponent(em)}`, { method: "DELETE" });
    load();
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
      <a href="/brain" style={{ color: "#742220" }}>← Brain</a>
      <h1 style={{ fontSize: 24 }}>👥 Team</h1>
      <p style={{ opacity: 0.7 }}>You are <strong>{me?.user.email}</strong> · role <strong>{me?.role}</strong></p>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>Members ({members.length})</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {members.map((m) => (
          <li key={m.id} style={row}>{m.role === "owner" ? "👑" : "👤"} {m.email} <span style={{ opacity: 0.5 }}>· {m.role}</span></li>
        ))}
        {!isOwner && members.length === 0 && <p style={{ opacity: 0.5 }}>Owner-only view.</p>}
      </ul>

      {isOwner && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 20 }}>Invite a member</h2>
          <form onSubmit={invite} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
            <select value={role} onChange={(e) => setRole(e.target.value as "member" | "owner")} style={inp}>
              <option value="member">member</option>
              <option value="owner">owner</option>
            </select>
            <button type="submit" style={btn}>Invite</button>
          </form>
          {msg && <p style={{ opacity: 0.8 }}>{msg}</p>}

          <h2 style={{ fontSize: 16, marginTop: 20 }}>Pending invites</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {invites.filter((i) => !i.usedAt).map((i) => (
              <li key={i.email} style={row}>
                ✉️ {i.email} <span style={{ opacity: 0.5 }}>· {i.role}</span>
                <button onClick={() => revoke(i.email)} style={{ float: "right", ...btn, background: "#742220", borderColor: "#742220", padding: "2px 10px" }}>revoke</button>
              </li>
            ))}
            {invites.filter((i) => !i.usedAt).length === 0 && <p style={{ opacity: 0.5 }}>None.</p>}
          </ul>
          <p style={{ opacity: 0.55, fontSize: 13 }}>Invited people sign up at <code>/setup</code> with that exact email.</p>
        </>
      )}
    </main>
  );
}

const row: React.CSSProperties = { border: "1px solid rgba(45,74,62,.28)", borderRadius: 8, padding: "8px 12px", marginBottom: 6, background: "#fffdf2" };
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(45,74,62,.32)", background: "#fffdf2", color: "#2d4a3e" };
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #742220", background: "#742220", color: "#fef9e1", cursor: "pointer" };
