import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Emit a self-contained server bundle with only the node_modules actually
   * imported at runtime. Without this the production image has to ship the
   * whole 500 MB dependency tree.
   */
  output: "standalone",

  // The frontend is client-rendered and talks to the API on the same host,
  // so nothing here should be prerendered with a baked-in API origin.
  poweredByHeader: false,
};

export default nextConfig;
