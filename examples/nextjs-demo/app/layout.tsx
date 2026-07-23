import type { ReactNode } from "react";

export const metadata = {
  title: "ShieldFont demo — Next.js",
  description: "Demonstrating @shieldfont/react in a Next.js App Router page.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          background: "#0d1014",
          color: "#e4e4e4",
          maxWidth: "720px",
          margin: "0 auto",
          padding: "48px 32px",
          lineHeight: 1.6,
        }}
      >
        {children}
      </body>
    </html>
  );
}
