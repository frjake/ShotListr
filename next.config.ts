import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module + Prisma adapter must not be bundled by Turbopack.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
