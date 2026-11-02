import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolved at build time (standalone output bakes rewrites in); Docker passes it as a build arg.
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@erp-mail/shared'],
  experimental: {
    outputFileTracingRoot: path.join(dirname, '../../'),
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
