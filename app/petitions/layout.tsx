import type { Metadata } from "next";

const BASE_URL = "https://gaepanai.com";

export const metadata: Metadata = {
  title: "국민 청원 | 개판 AI",
  description:
    "국민 청원에 동의하고 대법관의 답변을 받아보세요. 개판 AI 국민 청원.",
  openGraph: {
    title: "국민 청원 | 개판 AI",
    description:
      "국민 청원에 동의하고 대법관의 답변을 받아보세요. 개판 AI 국민 청원.",
    url: `${BASE_URL}/petitions`,
  },
  alternates: { canonical: `${BASE_URL}/petitions` },
};

export default function PetitionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
