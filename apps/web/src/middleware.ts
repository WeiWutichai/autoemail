import { NextResponse, type NextRequest } from 'next/server';

const REFRESH_COOKIE = 'refresh_token';

/** Coarse gate: the refresh cookie must exist; the API still validates every request. */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(REFRESH_COOKIE);
  const { pathname, search } = req.nextUrl;

  if (pathname === '/login') {
    return hasSession ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }
  if (!hasSession) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
