import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let API routes pass through to Next.js API handlers
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Let static files pass through (served from public/static/)
  if (pathname.startsWith('/static/')) {
    return NextResponse.next();
  }

  // Let Next.js internals pass through
  if (pathname.startsWith('/_next/')) {
    return NextResponse.next();
  }

  // Let files with extensions pass through (favicon, images, etc.)
  if (pathname.includes('.')) {
    return NextResponse.next();
  }

  // Rewrite all other paths to the SPA shell
  return NextResponse.rewrite(new URL('/index.html', request.url));
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    '/((?!api|static|_next|favicon.ico).*)',
  ],
};
