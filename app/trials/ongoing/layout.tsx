import type { Metadata } from "next";

const BASE_URL = "https://gaepanai.com";

export const metadata: Metadata = {
  title: "진행 중인 재판 | 개판 AI",
  description:
    "지금 진행 중인 재판을 보고 배심원으로 참여하세요. 유죄·무죄 투표 후 최종 선고문이 작성됩니다.",
  openGraph: {
    title: "진행 중인 재판 | 개판 AI",
    description:
      "지금 진행 중인 재판을 보고 배심원으로 참여하세요. 유죄·무죄 투표 후 최종 선고문이 작성됩니다.",
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
