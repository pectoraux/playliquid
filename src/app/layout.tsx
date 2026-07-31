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
  title: "PlayLiquid — Play. Create. Earn.",
  description: "The all-in-one platform where players discover games, creators build worlds, and everyone gets rewarded.",
  keywords: ["PlayLiquid", "gaming platform", "play games", "create games", "earn rewards"],
  authors: [{ name: "PlayLiquid" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "PlayLiquid — Play. Create. Earn.",
    description: "The all-in-one platform where players discover games, creators build worlds, and everyone gets rewarded.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlayLiquid — Play. Create. Earn.",
    description: "The all-in-one platform where players discover games, creators build worlds, and everyone gets rewarded.",
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
