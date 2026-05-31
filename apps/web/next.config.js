/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@revisor-tesis/shared'],

  // Intercepta las peticiones y las manda al backend local
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*'
      }
    ];
  }
};

module.exports = nextConfig;