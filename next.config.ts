import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Native / Node-only modules: never bundle into the server client edge. */
  serverExternalPackages: ["better-sqlite3", "archiver"],
  transpilePackages: ["monaco-editor"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
