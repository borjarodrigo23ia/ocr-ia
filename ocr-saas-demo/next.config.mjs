/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'sharp']
  },
  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif']
  }
}

export default nextConfig 