import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // Skip middleware for process-pdf endpoint
  if (req.nextUrl.pathname === '/api/process-pdf') {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Get authenticated user instead of session
  const { data: { user }, error } = await supabase.auth.getUser();

  // If accessing protected routes without auth, redirect to auth page
  const protectedRoutes = ['/campaigns', '/campaigns/new'];
  if ((!user || error) && protectedRoutes.some(route => req.nextUrl.pathname.startsWith(route))) {
    const redirectUrl = new URL('/auth', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // If accessing auth page while authenticated, redirect to campaigns
  if (user && !error && req.nextUrl.pathname === '/auth') {
    const redirectUrl = new URL('/campaigns', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/process-pdf (PDF processing endpoint)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/process-pdf).*)',
  ],
}; 