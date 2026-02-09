import type { Metadata } from "next";

const BASE_URL = "https://gaepanai.com";

export const metadata: Metadata = {
  title: "새 청원 작성 | 개판 AI",
  description:
    "새 국민 청원을 작성하세요. 대법관이 답변해 드립니다.",
  openGraph: {
    title: "새 청원 작성 | 개판 AI",
    url: `${BASE_URL}/petitions/new`,
  },
  alternates: { canonical: `${BASE_URL}/petitions/new` },
};

export default function NewPetitionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
