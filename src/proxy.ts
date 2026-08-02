import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":", 1)[0];
  if (hostname !== "127.0.0.1") return NextResponse.next();
  const destination = request.nextUrl.clone();
  destination.hostname = "localhost";
  return NextResponse.redirect(destination);
}
