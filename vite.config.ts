import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readEnvPort } from "./scripts/read-env-port.mjs";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Mesma regra que `server/server.mjs` e `scripts/dev-all.mjs` (inclui porta em VITE_API_BASE_URL localhost).
  const apiPortRaw =
    env.VITE_DEV_API_PORT ||
    env.PORT ||
    process.env.PORT ||
    String(readEnvPort());
  const apiPort = Number(apiPortRaw) || 8081;
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;
  const taggerPlugin =
    mode === "development"
      ? await (async () => {
          try {
            const mod = await import("lovable-tagger");
            const factory =
              typeof (mod as { componentTagger?: unknown }).componentTagger === "function"
                ? (mod as { componentTagger: () => unknown }).componentTagger
                : typeof (mod as { default?: unknown }).default === "function"
                  ? ((mod as { default: () => unknown }).default as () => unknown)
                  : null;
            return factory ? factory() : null;
          } catch {
            return null;
          }
        })()
      : null;

  return {
    // Mesma porta do proxy: o browser usa em `buildLongRunningApiUrl` (evita 8088 fixo ≠ PORT do .env).
    define: {
      "import.meta.env.VITE_DEV_API_PORT": JSON.stringify(String(apiPort)),
    },
    server: {
      host: "::",
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          timeout: 900_000,
          proxyTimeout: 900_000,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("origin");
            });

            proxy.on("error", (error, req, res) => {
              const method = req?.method || "GET";
              const url = req?.url || "";
              console.error("[vite-proxy]", method, url, String((error as Error)?.message || error));
              try {
                if (res && !res.headersSent) {
                  res.writeHead(502, { "Content-Type": "application/json" });
                  const payload: Record<string, string> = {
                    message: "Não foi possível conectar ao servidor agora. Tente novamente em instantes.",
                  };
                  if (mode === "development") {
                    payload.hint =
                      "A API não está aceitando conexões na porta do proxy. Reinicie `npm run dev:all` ou rode `npm run dev:api` e confira erros (DB, crash).";
                  }
                  res.end(JSON.stringify(payload));
                }
              } catch {
                void 0;
              }
            });

            proxy.on("proxyRes", (proxyRes, req) => {
              const statusCode = proxyRes?.statusCode ?? 0;
              if (statusCode >= 500) {
                const method = req?.method || "GET";
                const url = req?.url || "";
                console.warn("[vite-proxy]", statusCode, method, url);
              }
            });
          },
        },
      },
    },
    preview: {
      host: "::",
      port: 4173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          timeout: 900_000,
          proxyTimeout: 900_000,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("origin");
            });
            proxy.on("error", (error, req, res) => {
              const method = req?.method || "GET";
              const url = req?.url || "";
              console.error("[vite-preview-proxy]", method, url, String((error as Error)?.message || error));
              try {
                if (res && !res.headersSent) {
                  res.writeHead(502, { "Content-Type": "application/json" });
                  const payload: Record<string, string> = {
                    message: "Não foi possível conectar ao servidor agora. Tente novamente em instantes.",
                  };
                  if (mode === "development") {
                    payload.hint =
                      "A API não está aceitando conexões na porta do proxy. Reinicie `npm run dev:all` ou rode `npm run dev:api` e confira erros (DB, crash).";
                  }
                  res.end(JSON.stringify(payload));
                }
              } catch {
                void 0;
              }
            });
          },
        },
      },
    },
    plugins: [react(), taggerPlugin].filter(Boolean),
    build: {},
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
