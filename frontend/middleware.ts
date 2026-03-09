import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 前缀匹配的公开路径
const publicPrefixes = ["/auth/login", "/auth/register", "/auth"];
// 精确匹配的公开路径
const publicExactPaths = ["/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径直接放行（前缀匹配 + 精确匹配）
  if (
    publicPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    publicExactPaths.includes(pathname)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;

  // 未登录用户重定向到欢迎页
  if (!token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();

  response.headers.set("x-user-authenticated", "true");

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
