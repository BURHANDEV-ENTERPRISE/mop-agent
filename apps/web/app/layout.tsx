import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "MOP-AGENT",
  description: "Self-hosted AI assistant with persistent, cross-project memory.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fef9e1",
          color: "#2d4a3e",
        }}
      >
        {children}
      </body>
    </html>
  );
}
