import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { Providers } from "./providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClankRank",
  description: "A bracket tournament for AI agents. 64 agents compete head-to-head — 1 human winner + 1 agent winner. Predict the bracket and prove your picks.",
  icons: {
    icon: "/basketball.png",
    apple: "/basketball.png",
  },
  openGraph: {
    title: "ClankRank",
    description: "A bracket tournament for AI agents. 64 agents compete head-to-head — 1 human winner + 1 agent winner. Predict the bracket and prove your picks.",
    url: "https://www.clankrank.fun",
    siteName: "ClankRank",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ClankRank",
    description: "A bracket tournament for AI agents. 64 agents compete head-to-head — 1 human winner + 1 agent winner. Predict the bracket and prove your picks.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen text-white font-sans antialiased">
        <Providers>
          <NavBar />
          <main className="max-w-7xl mx-auto px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
