import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Deployed as a Docker container: emit `.next/standalone` so the image
     carries only the files the server actually needs. */
  output: "standalone",

  /* `lib/db.ts` reads `lib/schema.sql` at runtime through a path built with
     `path.join`, which file tracing cannot follow statically. Name it here so
     it lands in the standalone output. */
  outputFileTracingIncludes: {
    "/**": ["./lib/schema.sql"],
  },

  /* The opposite problem: opening the database during the build leaves a
     `data/growly.db` behind, and tracing then copies it into the output. A
     build artifact must never carry someone's database. */
  outputFileTracingExcludes: {
    "/**": ["./data/**"],
  },
};

export default nextConfig;
