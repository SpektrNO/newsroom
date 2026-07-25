import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  transpilePackages: [
    "@newsroom/db",
    "@newsroom/ai",
    "@newsroom/api-client",
    "@newsroom/sources",
    "@newsroom/worker",
  ],
  webpack: (config) => {
    // Worker sources use ESM `.js` import specifiers that map to `.ts` files (tsx).
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
