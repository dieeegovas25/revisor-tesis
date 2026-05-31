/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@revisor-tesis/shared'],

  // Intercepta las peticiones y las manda al backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.INTERNAL_API_URL || 'http://127.0.0.1:3001'}/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;