import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["*.trycloudflare.com"],
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
