/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@erp-mail/shared'],
};

export default nextConfig;
