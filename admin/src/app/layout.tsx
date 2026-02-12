import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import TopLoadingBar from "@/components/ui/TopLoadingBar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DigitalCoo Admin Panel",
  description: "Centralized admin panel for DigitalCoo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased dark`}
      >
        <ThemeProvider>
          <TopLoadingBar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
