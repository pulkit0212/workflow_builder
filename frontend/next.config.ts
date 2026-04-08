import type { NextConfig } from "next";
import type { Configuration as WebpackConfig } from "webpack";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Playwright / legacy-bot must run from Node at runtime — never bundle (breaks on chromium-bidi subpaths). */
function isPlaywrightOrBotRequest(request: string | undefined): boolean {
  if (!request) return false;
  return (
    request === "playwright" ||
    request === "playwright-core" ||
    request === "chromium-bidi" ||
    request.startsWith("playwright/") ||
    request.startsWith("playwright-core/") ||
    request.startsWith("chromium-bidi/") ||
    request.includes(`${path.sep}legacy-bot${path.sep}`) ||
    request.includes("/legacy-bot/") ||
    request.includes("\\legacy-bot\\") ||
    request.endsWith(`${path.sep}legacy-bot`) ||
    request.endsWith("/legacy-bot")
  );
}

const nextConfig: NextConfig = {
  // Monorepo: lockfile at repo root + frontend — pin tracing to repo root to silence warnings.
  outputFileTracingRoot: path.join(__dirname, ".."),
  typedRoutes: true,
  async redirects() {
    return [
      // Removed workspace-specific sub-pages → unified pages (Req 9.9)
      // Static paths must come before dynamic :workspaceId patterns
      {
        source: "/dashboard/workspace/action-items",
        destination: "/dashboard/action-items",
        permanent: true,
      },
      {
        source: "/dashboard/workspaces",
        destination: "/dashboard/workspace",
        permanent: true,
      },
      {
        source: "/dashboard/workspace/:workspaceId/meetings",
        destination: "/dashboard/meetings",
        permanent: true,
      },
      {
        source: "/dashboard/workspace/:workspaceId/action-items",
        destination: "/dashboard/action-items",
        permanent: true,
      },
      {
        source: "/dashboard/workspace/:workspaceId/overview",
        destination: "/dashboard",
        permanent: true,
      },
      {
        source: "/dashboard/workspace/:workspaceId",
        destination: "/dashboard/workspace",
        permanent: true,
      },
    ];
  },
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "chromium-bidi",
  ],
  webpack: (config: WebpackConfig, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        pg: false,
        "pg-native": false,
      };
    } else {
      const prev = config.externals;
      const handler: NonNullable<WebpackConfig["externals"]> = (
        data,
        callback: (err?: Error | null, result?: string) => void,
      ) => {
        const request =
          data && typeof data === "object" && "request" in data
            ? (data as { request?: string }).request
            : undefined;
        if (isPlaywrightOrBotRequest(request)) {
          return callback(undefined, `commonjs ${request}`);
        }
        callback();
      };

      if (Array.isArray(prev)) {
        config.externals = [handler, ...prev];
      } else if (prev !== undefined) {
        config.externals = [handler, prev];
      } else {
        config.externals = handler;
      }
    }

    return config;
  },
};

export default nextConfig;
