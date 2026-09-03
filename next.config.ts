import type { NextConfig } from "next";

/**
 * Content uploads a .docx/.pdf notice through a server action; the default
 * action payload cap is 1MB, which a PDF with images clears easily.
 *
 * Two limits have to agree, not one. `proxy.ts` matches every route, so the
 * upload POST is buffered by the proxy before the action ever sees it, and that
 * buffer defaults to 10MB — over which Next truncates the body and only logs a
 * warning rather than failing the request. A 12MB action limit behind a 10MB
 * proxy buffer means a large notice arrives silently half-read, so both come
 * from the same value.
 */
const uploadLimit = (process.env.CONTENT_UPLOAD_LIMIT ?? "12mb") as NonNullable<
  NonNullable<NextConfig["experimental"]>["serverActions"]
>["bodySizeLimit"];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: uploadLimit },
    proxyClientMaxBodySize: uploadLimit,
  },
};

export default nextConfig;
