import type { Metadata } from "next";
import "./globals.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AuthProvider } from "@/components/AuthProvider";

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
      <body className="antialiased">
        <AppErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
