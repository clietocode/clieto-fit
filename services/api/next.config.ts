import { config } from "dotenv";
import path from "node:path";
import type { NextConfig } from "next";

config({ path: path.resolve(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@clieto-fit/shared"],
  turbopack: { root: path.resolve(process.cwd(), "../..") },
};

export default nextConfig;
