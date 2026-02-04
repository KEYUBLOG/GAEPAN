import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "개판 - AI 법정",
  description:
    "당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 지금 바로 소장을 접수하세요.",
  openGraph: {
    title: "개판 - AI 법정",
    description:
      "당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 지금 바로 소장을 접수하세요.",
    url: "https://gaepanai.com",
    siteName: "개판 - AI 법정",
    images: [
      {
        url: "https://gaepanai.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "개판 - AI 법정",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "개판 - AI 법정",
    description:
      "당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 지금 바로 소장을 접수하세요.",
    images: ["https://gaepanai.com/og-image.png"],
  },
  verification: {
    other: {
      "naver-site-verification": "346b68e3398aed95fcc5ab02e5a53a25e8e149ef",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
