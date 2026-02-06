import Link from "next/link";

/** 메인 페이지와 동일한 GAEPAN 로고 (폰트·크기 통일). font-sans로 페이지 폰트 상속 무시 */
const LOGO_CLASS =
  "shrink-0 font-sans text-lg md:text-2xl font-black tracking-tighter text-amber-500 italic";

type Props = { className?: string };

export function Logo({ className = "" }: Props) {
  return (
    <Link href="/" className={`${LOGO_CLASS} ${className}`.trim()}>
      GAEPAN
    </Link>
  );
}
