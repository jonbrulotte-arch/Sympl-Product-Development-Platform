import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.132.94"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
