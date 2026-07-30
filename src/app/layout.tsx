import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PlayLiquid — Production Architecture Foundation",
  description: "Event-driven gaming platform built with DDD, CQRS, Event Sourcing, and the Outbox pattern.",
  keywords: ["PlayLiquid", "DDD", "CQRS", "Event Sourcing", "Outbox", "Next.js", "TypeScript"],
  authors: [{ name: "PlayLiquid" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "PlayLiquid Architecture Foundation",
    description: "Production-grade event-driven architecture",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlayLiquid Architecture Foundation",
    description: "Production-grade event-driven architecture",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
