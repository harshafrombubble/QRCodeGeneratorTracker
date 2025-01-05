/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Add your Supabase URL to allowed domains if you're using Next.js Image component
  images: {
    domains: ['supabase.co'],
  },
}

module.exports = nextConfig
