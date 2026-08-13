import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "ShieldFont Studio",
  description: "Create custom word mappings, compare human and system views, and export protected content.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
