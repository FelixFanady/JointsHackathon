import type { Metadata } from "next";
import { DialogHost } from "@/components/Dialog";
import "../styles/globals.scss";

export const metadata: Metadata = {
  title: "SiagaKu — Pusat Operasi",
  description: "Konsol petugas support dan admin SiagaKu",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/material-symbols.woff2?v=de494b4c" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <DialogHost />
      </body>
    </html>
  );
}
