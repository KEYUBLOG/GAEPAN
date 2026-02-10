import type { Metadata } from "next";

const BASE_URL = "https://gaepanai.com";

export const metadata: Metadata = {
  title: "판결 완료된 사건 | 개판 AI",
  description:
    "GAEPAN 법정을 거친 판결 기록을 확인하세요. AI 대법관과 배심원의 최종 선고을 볼 수 있습니다.",
  openGraph: {
    title: "판결 완료된 사건 | 개판 AI",
    description:
      "GAEPAN 법정을 거친 판결 기록을 확인하세요. AI 대법관과 배심원의 최종 선고을 볼 수 있습니다.",
    url: `${BASE_URL}/trials/completed`,
  },
  alternates: { canonical: `${BASE_URL}/trials/completed` },
};

export default function CompletedTrialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
