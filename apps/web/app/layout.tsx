import type { ReactNode } from "react";

export const metadata = {
  title: "MOP-AGENT",
  description: "Self-hosted AI assistant with persistent, cross-project memory.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0f17",
          color: "#e6edf3",
        }}
      >
        {children}
      </body>
    </html>
  );
}
