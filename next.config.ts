import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // 프로젝트 루트를 GAEPAN으로 고정 (상위 폴더의 package-lock.json과 혼동 방지)
    root: ".",
  },
};

export default nextConfig;
