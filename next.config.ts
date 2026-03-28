import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xgbxjkvatffsjqmgtmwe.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "v3b.fal.media",
        pathname: "/files/**",
      },
    ],
  },
};

export default nextConfig;
