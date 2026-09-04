import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readToken } from "@/lib/auth-token";

/* The gate in front of every request. It only reads the cookie's signature —
   the session row itself is checked in lib/auth, close to the data. */

const PUBLIC_PATHS = new Set(["/login", "/setup"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = readToken(request.cookies.get(SESSION_COOKIE)?.value) !== null;

  if (PUBLIC_PATHS.has(pathname)) {
    // Someone already signed in has no business on the sign-in screen.
    return signedIn ? NextResponse.redirect(new URL("/", request.nextUrl)) : NextResponse.next();
  }
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.nextUrl);
  // Come back to where they were headed once they are through.
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
