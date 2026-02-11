import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Footer } from "@/app/components/Footer";
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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "개판 AI - 개인들의 판결소",
  icons: { icon: "/icon.png" },
  description:
    "배심원 투표와 함께 최종 선고문을 만들어 드립니다. 기소장 접수 후 24시간 뒤 선고문이 나옵니다.",
  openGraph: {
    title: "개판 AI - 개인들의 판결소",
    description:
      "배심원 투표와 함께 최종 선고문을 만들어 드립니다. 기소장 접수 후 24시간 뒤 선고문이 나옵니다.",
    url: "https://gaepanai.com",
    siteName: "개판 AI - 개인들의 판결소",
    images: [
      {
        url: "https://gaepanai.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "개판 - 개인들의 판결소",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "개판 AI - 개인들의 판결소",
    description:
      "배심원 투표와 함께 최종 선고문을 만들어 드립니다. 기소장 접수 후 24시간 뒤 선고문이 나옵니다.",
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
    description: "배심원 투표와 함께 최종 선고문을 만들어 드립니다. 기소장 접수 후 24시간 뒤 선고문이 나옵니다.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden flex flex-col min-h-screen bg-zinc-950`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <main className="flex-1">{children}</main>
        <Footer />
        {/* 실시간 재판소 고정 바 높이만큼 여백 — 푸터가 바에 가려지지 않도록 */}
        <div className="h-16 shrink-0 bg-zinc-950" aria-hidden />
        <Analytics />
      </body>
    </html>
  );
}
