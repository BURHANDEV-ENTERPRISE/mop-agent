/**
 * Status landing (Fasa 1). Shows linked projects + a "Link Project" helper.
 * TODO Fasa 2+: replace with setup wizard + Brain dashboard (see PRD §13 wireframes).
 */
async function getProjects(): Promise<{ projects: Array<Record<string, unknown>> }> {
  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/projects`, {
      cache: "no-store",
    });
    return (await res.json()) as { projects: Array<Record<string, unknown>> };
  } catch {
    return { projects: [] };
  }
}

export default async function Home() {
  const { projects } = await getProjects();
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>🧠 MOP-AGENT</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        The Brain — remembers everything, federates every project. Status: scaffolding (Fasa 1).
      </p>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Linked projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No projects linked yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {projects.map((p) => (
              <li
                key={String(p.id)}
                style={{
                  border: "1px solid #1f2a3a",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 8,
                }}
              >
                <strong>{String(p.name)}</strong>{" "}
                <span style={{ opacity: 0.6 }}>
                  · {String(p.status)} · {String(p.memoryCount)} memories
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Link a project (dev)</h2>
        <pre
          style={{
            background: "#111824",
            border: "1px solid #1f2a3a",
            borderRadius: 8,
            padding: 16,
            overflowX: "auto",
          }}
        >
{`# 1) get a pairing code
curl -X POST http://localhost:3000/api/link/code

# 2) in a project dir that has .MOP/, run the dev connector
mop-flow-dev link --url http://localhost:3000 --code <CODE> --project <id>
mop-flow-dev serve`}
        </pre>
      </section>
    </main>
  );
}
