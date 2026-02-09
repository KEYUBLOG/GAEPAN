import type { Metadata } from "next";

const BASE_URL = "https://gaepanai.com";

export const metadata: Metadata = {
  title: "진행 중인 재판 | 개판 AI",
  description:
    "지금 진행 중인 재판을 보고 배심원으로 참여하세요. AI 대법관과 함께 유죄·무죄를 판단합니다.",
  openGraph: {
    title: "진행 중인 재판 | 개판 AI",
    description:
      "지금 진행 중인 재판을 보고 배심원으로 참여하세요. AI 대법관과 함께 유죄·무죄를 판단합니다.",
    url: `${BASE_URL}/trials/ongoing`,
  },
  alternates: { canonical: `${BASE_URL}/trials/ongoing` },
};

export default function OngoingTrialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
