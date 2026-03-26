import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile chessground (ESM package)
  transpilePackages: ["chessground"],
};

export default nextConfig;
