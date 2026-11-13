
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Ensure heavy AI and PDF libraries are treated as external to speed up compilation
  serverExternalPackages: [
    'pdf-lib',
    'genkit',
    'dotprompt',
    'handlebars',
    '@genkit-ai/googleai',
    '@genkit-ai/google-genai'
  ],
  experimental: {
    // Optimize imports for commonly used heavy libraries to reduce chunk size
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      'clsx',
      'tailwind-merge'
    ],
  }
};

export default nextConfig;
