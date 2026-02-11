import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 봇/스캐너가 탐색하는 민감·설정 경로 → 즉시 404 (컴파일/렌더 없이 로그만 최소화) */
function isProbePath(pathname: string): boolean {
  const p = pathname.toLowerCase();

  // .env 계열 (/.env, /.env.local, /app/.env 등)
  if (p === "/.env" || p.startsWith("/.env.") || (p.startsWith("/.env") && (p.length === 5 || p[5] === "/" || p[5] === "~"))) return true;
  if (/\/(app|src|config|backend|frontend|api|server|client|web|public|private|var)\/\.env/.test(p)) return true;

  // env, env.js, env.json
  if (p === "/env" || p === "/env.js" || p === "/env.json") return true;

  // docker-compose
  if (p.startsWith("/docker-compose")) return true;

  // 설정/시크릿 파일 (루트)
  const rootSensitive = [
    "/config.js", "/config.json", "/config.py",
    "/settings.js", "/settings.json", "/settings.py",
    "/secrets.json", "/secrets.py", "/credentials.json",
    "/app.js", "/main.js", "/index.js", "/server.js",
    "/bundle.js", "/app.bundle.js", "/main.bundle.js",
    "/vendor.js", "/chunk.js",
    "/static/js/main.js", "/static/js/app.js", "/static/js/bundle.js",
    "/dist/main.js", "/dist/app.js", "/dist/bundle.js",
    "/build/static/js/main.js",
    "/assets/index.js", "/assets/app.js",
    "/js/app.js", "/js/main.js",
  ];
  if (rootSensitive.some((s) => p === s || p.startsWith(s + "/"))) return true;

  // config/ 시크릿
  if (p.startsWith("/config/secrets") || p.startsWith("/config/master.key")) return true;

  // wp-config
  if (p.startsWith("/wp-config.php")) return true;

  return false;
}

export function proxy(request: NextRequest) {
  if (isProbePath(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}
