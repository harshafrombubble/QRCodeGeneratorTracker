/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['bubbledateflyers.s3.us-east-2.amazonaws.com'],
  },
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
}

module.exports = nextConfig 