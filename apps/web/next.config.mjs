import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@erp-mail/shared'],
  experimental: {
    outputFileTracingRoot: path.join(dirname, '../../'),
  },
};

export default nextConfig;
