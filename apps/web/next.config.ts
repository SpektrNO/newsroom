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
    "@newsroom/worker",
  ],
};

export default nextConfig;
