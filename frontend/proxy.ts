import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPrefixes = ["/auth/login", "/auth/register", "/auth", "/mock"];
const publicExactPaths = ["/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    publicPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    publicExactPaths.includes(pathname)
  ) {
    return NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
