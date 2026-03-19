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

  const token = request.cookies.get("access_token")?.value;
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
