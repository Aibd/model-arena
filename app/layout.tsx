import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Model Arena - LLM Comparison Arena",
  description: "A premium platform for side-by-side LLM evaluation and comparison.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
