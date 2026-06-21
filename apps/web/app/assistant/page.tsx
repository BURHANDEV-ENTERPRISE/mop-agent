"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useMemoryCore } from "@/components/AppShell";

type Turn = { role: "user" | "assistant"; content: string };
type SavedChat = { id: string; title: string; turns: Turn[]; updatedAt: number };

const CHAT_HISTORY_KEY = "mop-agent-chat-history-v1";

export default function AssistantPage() {
  const { projects } = useMemoryCore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [name, setName] = useState("Admin");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [providerUsed, setProviderUsed] = useState("");
  const [history, setHistory] = useState<SavedChat[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [activeChatId, setActiveChatId] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((me) => {
      setName(me.user?.name || me.user?.email || "Admin");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) ?? "[]");
      if (Array.isArray(stored)) setHistory(stored.slice(0, 30));
    } catch {
      window.localStorage.removeItem(CHAT_HISTORY_KEY);
    } finally {
      setHistoryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
  }, [history, historyReady]);

  useEffect(() => {
    if (!activeChatId || turns.length === 0) return;
    const firstMessage = turns.find((turn) => turn.role === "user")?.content ?? "New conversation";
    setHistory((current) => {
      const updated: SavedChat = {
        id: activeChatId,
        title: firstMessage.slice(0, 54),
        turns,
        updatedAt: Date.now(),
      };
      return [updated, ...current.filter((chat) => chat.id !== activeChatId)].slice(0, 30);
    });
  }, [activeChatId, turns]);

  function startNewChat() {
    if (busy) return;
    setActiveChatId("");
    setTurns([]);
    setProviderUsed("");
    setInput("");
  }

  function openChat(chat: SavedChat) {
    if (busy) return;
    setActiveChatId(chat.id);
    setTurns(chat.turns);
    setProviderUsed("");
  }

  function deleteChat(id: string) {
    if (busy) return;
    setHistory((current) => current.filter((chat) => chat.id !== id));
    if (activeChatId === id) startNewChat();
  }

  async function send(prefill?: string) {
    const message = (prefill ?? input).trim();
    if (!message || busy) return;
    if (!activeChatId) setActiveChatId(`chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setInput("");
    setBusy(true);
    setTurns((current) => [...current, { role: "user", content: message }, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        allowCrossProject: true,
      }),
    });

    setProviderUsed(res.headers.get("X-Provider") ?? "");
    if (!res.ok || !res.body) {
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = { role: "assistant", content: `Unable to answer (error ${res.status}).` };
        return next;
      });
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = { role: "assistant", content: answer };
        return next;
      });
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    setBusy(false);
  }

  return (
    <section className="mop-assistant-page">
      <div className="mop-assistant-workspace">
        <div className="mop-assistant-conversation">
          {turns.length === 0 ? (
            <div className="mop-assistant-welcome">
              <div style={assistantLogo}><img src="/icon.svg" alt="MOP-AGENT" /></div>
              <p style={{ color: "#742220", fontSize: 11, fontWeight: 900, letterSpacing: ".16em" }}>MOP-AGENT IS READY</p>
              <h1 style={{ fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: "clamp(26px, 4vw, 40px)", margin: "8px 0 12px" }}>
                What are we working on, {name.split(" ")[0]}?
              </h1>
              <p style={{ color: "rgba(45,74,62,.7)", maxWidth: 610, lineHeight: 1.65 }}>
                Start talking immediately. Link projects when you want MOP-AGENT to remember their state and work across them.
              </p>
              <div className="mop-prompt-grid" style={promptGrid}>
                {["Help me plan today’s work", "What can MOP-AGENT do?", "Summarize what you remember", "Plan a new software project"].map((prompt) => (
                  <button key={prompt} onClick={() => send(prompt)} style={promptCard}>{prompt}<span>→</span></button>
                ))}
              </div>
              {projects.length === 0 && (
                <p style={{ fontSize: 13, color: "rgba(45,74,62,.68)", marginTop: 24 }}>
                  No project linked yet—this does not block chat. <a href="/brain" style={{ color: "#742220" }}>Link one from Brain →</a>
                </p>
              )}
            </div>
          ) : (
            <div style={{ width: "min(100%, 820px)", margin: "0 auto", padding: "28px 0 160px" }}>
              {turns.map((turn, index) => (
                <article key={index} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 13, marginBottom: 26 }}>
                  <span style={turn.role === "assistant" ? botAvatar : userAvatar}>{turn.role === "assistant" ? "✦" : name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong style={{ fontSize: 13, color: turn.role === "assistant" ? "#742220" : "#2d4a3e" }}>{turn.role === "assistant" ? "MOP-AGENT" : "You"}</strong>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 6, color: "#2d4a3e" }}>{turn.content || "Thinking…"}</div>
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="mop-assistant-composer-wrap">
          <div style={composer}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message MOP-AGENT…"
              rows={1}
              style={textarea}
            />
            <button onClick={() => send()} disabled={busy || !input.trim()} style={{ ...sendButton, opacity: busy || !input.trim() ? .45 : 1 }}>↑</button>
          </div>
          <div style={{ textAlign: "center", color: "rgba(45,74,62,.62)", fontSize: 11, marginTop: 8 }}>
            {providerUsed ? `Answered by ${providerUsed} · ` : ""}Cross-project memory
          </div>
        </div>
      </div>

      <aside className="mop-chat-history" aria-label="Chat history">
        <div className="mop-chat-history-header">
          <div>
            <span>MEMORY LOG</span>
            <strong>Chat history</strong>
          </div>
          <button type="button" onClick={startNewChat} disabled={busy} title="Start a new chat">＋</button>
        </div>
        <div className="mop-chat-history-list">
          {history.length === 0 ? (
            <p className="mop-chat-history-empty">Your conversations will appear here.</p>
          ) : history.map((chat) => (
            <div className={`mop-chat-history-item${chat.id === activeChatId ? " is-active" : ""}`} key={chat.id}>
              <button type="button" className="mop-chat-history-open" onClick={() => openChat(chat)} disabled={busy}>
                <strong>{chat.title}</strong>
                <span>{formatChatDate(chat.updatedAt)}</span>
              </button>
              <button type="button" className="mop-chat-history-delete" onClick={() => deleteChat(chat.id)} disabled={busy} aria-label={`Delete ${chat.title}`}>×</button>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function formatChatDate(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Saved conversation";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

const assistantLogo: CSSProperties = { width: 86, height: 86, display: "grid", placeItems: "center" };
const promptGrid: CSSProperties = { width: "min(100%, 650px)", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 28 };
const promptCard: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "14px 15px", border: "1px solid rgba(45,74,62,.38)", borderBottomWidth: 3, background: "#fffdf2", color: "#2d4a3e", cursor: "pointer", textAlign: "left" };
const botAvatar: CSSProperties = { width: 32, height: 32, display: "grid", placeItems: "center", background: "#742220", color: "#fef9e1" };
const userAvatar: CSSProperties = { ...botAvatar, background: "#2d4a3e", fontSize: 12 };
const composer: CSSProperties = { width: "min(calc(100% - 32px), 800px)", margin: "0 auto", display: "flex", alignItems: "flex-end", gap: 10, padding: "10px 10px 10px 15px", border: "1px solid rgba(45,74,62,.48)", borderBottomWidth: 4, background: "#fffdf2", boxShadow: "4px 4px 0 rgba(45,74,62,.13)" };
const textarea: CSSProperties = { flex: 1, resize: "none", border: 0, outline: 0, boxShadow: "none", background: "transparent", color: "#2d4a3e", font: "inherit", lineHeight: 1.55, padding: "5px 0" };
const sendButton: CSSProperties = { width: 34, height: 34, border: 0, background: "#742220", color: "#fef9e1", fontSize: 18, cursor: "pointer" };
