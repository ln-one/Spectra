import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 公开路径（无需登录即可访问）
const publicPaths = ["/auth/login", "/auth/register", "/auth", "/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径直接放行
  if (publicPaths.some((path) => pathname.startsWith(path))) {
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
