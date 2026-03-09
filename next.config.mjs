/** @type {import('next').NextConfig} */
const nextConfig = {
  // SPA static files live in public/static/
  // API routes live in app/api/v1/
  // All other paths should serve the SPA shell (public/index.html)

  // Prevent Vercel from 308-redirecting trailing slashes on POST/PUT/DELETE
  // Our middleware handles the rewrite instead
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return {
      // beforeFiles rewrites run before Next.js file-system routing
      // This ensures SPA routes are caught before the App Router tries to handle them
      beforeFiles: [
        {
          source: '/dashboard',
          destination: '/index.html',
        },
        {
          source: '/scrapers',
          destination: '/index.html',
        },
        {
          source: '/login',
          destination: '/index.html',
        },
        {
          source: '/map',
          destination: '/index.html',
        },
        {
          source: '/export',
          destination: '/index.html',
        },
        {
          source: '/import',
          destination: '/index.html',
        },
        {
          source: '/lead/:path*',
          destination: '/index.html',
        },
        {
          source: '/settings',
          destination: '/index.html',
        },
        {
          source: '/settings/:path*',
          destination: '/index.html',
        },
        {
          source: '/reports',
          destination: '/index.html',
        },
        {
          source: '/reports/:path*',
          destination: '/index.html',
        },
        {
          source: '/analytics',
          destination: '/index.html',
        },
        {
          source: '/properties',
          destination: '/index.html',
        },
        {
          source: '/properties/:path*',
          destination: '/index.html',
        },
      ],
    };
  },
};

export default nextConfig;
