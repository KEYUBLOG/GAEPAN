import type { Metadata } from "next";

const BASE_URL = "https://gaepanai.com";

export const metadata: Metadata = {
  title: "명예의 전당 | 개판 AI",
  description:
    "매주 투표수 1위를 기록한 사건입니다. 개판 AI 명예의 전당.",
  openGraph: {
    title: "명예의 전당 | 개판 AI",
    description:
      "매주 투표수 1위를 기록한 사건입니다. 개판 AI 명예의 전당.",
    url: `${BASE_URL}/hall-of-fame`,
  },
  alternates: { canonical: `${BASE_URL}/hall-of-fame` },
};

export default function HallOfFameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
