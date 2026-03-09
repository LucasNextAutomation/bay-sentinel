import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip trailing slashes from API routes (Django JS client uses them)
  if (pathname.startsWith('/api/') && pathname.endsWith('/') && pathname.length > 5) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(0, -1);
    return NextResponse.rewrite(url);
  }

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
    // Match ALL paths so we can handle API trailing slashes + SPA routes
    '/(.*)',
  ],
};
