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
  serverExternalPackages: [
    'pdf-lib',
    'genkit',
    'dotprompt',
    'handlebars',
    '@genkit-ai/googleai',
    '@genkit-ai/google-genai'
  ],
};

export default nextConfig;
