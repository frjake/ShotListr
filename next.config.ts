import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module + Prisma adapter must not be bundled by Turbopack.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  experimental: {
    // Script uploads (up to 20 MB, see src/lib/scripts.ts) go through Server Actions, whose
    // default body limit is 1 MB. The extra room covers multipart overhead and the sheet itself.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
