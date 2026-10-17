/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  serverExternalPackages: ["pg", "bcryptjs", "qrcode"],
};

module.exports = nextConfig;
