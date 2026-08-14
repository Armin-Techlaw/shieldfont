import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "ShieldFont Studio",
  description: "Compose formatted documents, create custom word mappings, and export masked Word and PDF files.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
