import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPrefixes = ["/auth/login", "/auth/register", "/auth"];
const publicExactPaths = ["/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    publicPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    publicExactPaths.includes(pathname)
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-user-authenticated", "true");
  return response;
}

export const config = {
  matcher: ["/((?!api|health|_next/static|_next/image|favicon.ico).*)"],
};
