import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Native / Node-only modules: never bundle into the server client edge. */
  serverExternalPackages: ["better-sqlite3", "archiver", "adm-zip"],
  transpilePackages: ["monaco-editor"],
};

export default nextConfig;
