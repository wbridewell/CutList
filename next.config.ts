import type { NextConfig } from "next";

const isTauriBuild = process.env.TAURI_BUILD === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Development-only pages under src/app/dev are named page.dev.tsx. The desktop export
  // drops that extension so they never reach the bundle; the Next dev server keeps them.
  pageExtensions: isTauriBuild ? ["tsx", "ts"] : ["dev.tsx", "tsx", "ts"],
  ...(isTauriBuild
    ? {
        output: "export",
        images: { unoptimized: true }
      }
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
              ]
            }
          ];
        }
      })
};

export default nextConfig;
