import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = "https://gaepanai.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
  },
  title: "개판 AI - 개인들의 판결소",
  icons: { icon: "/icon.png" },
  description:
    "당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 지금 바로 소장을 접수하세요.",
  openGraph: {
    title: "개판 AI - 개인들의 판결소",
    description:
      "당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 지금 바로 소장을 접수하세요.",
    url: "https://gaepanai.com",
    siteName: "개판 AI - 개인들의 판결소",
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
    title: "개판 AI - 개인들의 판결소",
    description:
      "당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 지금 바로 소장을 접수하세요.",
    images: ["https://gaepanai.com/og-image.png"],
  },
  verification: {
    other: {
      "naver-site-verification": "346b68e3398aed95fcc5ab02e5a53a25e8e149ef",
    },
  },
  other: {
    "google-adsense-account": "ca-pub-8420394320463132",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "개판 AI - 개인들의 판결소",
    description: "당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 지금 바로 소장을 접수하세요.",
    url: BASE_URL,
    inLanguage: "ko",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${BASE_URL}/?post={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
