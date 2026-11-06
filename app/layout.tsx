import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://startit-arshfaye.vercel.app"),
  title: "STARTIT — your AI co-founder",
  description: "Stress-test your startup idea against real customer complaints, follow a week-by-week plan, and get graded every Sunday.",
  openGraph: {
    title: "STARTIT — your AI co-founder",
    description: "Stress-test your startup idea against real customer complaints, follow a week-by-week plan, and get graded every Sunday.",
    url: "/",
    siteName: "STARTIT",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "STARTIT" }],
    type: "website",
  },
  twitter: { card: "summary", title: "STARTIT — your AI co-founder", images: ["/icon-512.png"] },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "STARTIT", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#181818", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
