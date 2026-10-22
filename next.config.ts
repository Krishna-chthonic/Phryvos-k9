import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Native / Node-only modules: never bundle into the server client edge. */
  serverExternalPackages: ["better-sqlite3", "archiver", "adm-zip"],
  transpilePackages: ["monaco-editor"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
        os: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
