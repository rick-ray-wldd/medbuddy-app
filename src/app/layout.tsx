import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedBuddy — 用藥理解與交接",
  description:
    "帶長輩看診的那一次,和他自己去的那一次,拿到的醫療是不一樣的。MedBuddy 把家人知道的事,變成醫師看得到的東西。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Traditional Chinese, and a base size set for presbyopia rather than for
    // density — the person this was designed around needs large type.
    <html lang="zh-Hant-TW" className="h-full antialiased text-[17px]">
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
