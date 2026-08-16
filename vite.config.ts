import vinext from "vinext";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // Vinext resolves files from public/ through the Worker when basePath is
  // enabled. Keep the generated asset binding available in production so
  // those responses contain the real file instead of an empty signal.
  assets: {
    binding: "ASSETS",
    not_found_handling: "none" as const,
  },
  durable_objects: {
    bindings: [
      { name: "PAIR_ROOMS", class_name: "PairRoom" },
      { name: "GROUP_ROOMS", class_name: "GroupRoom" },
    ],
  },
  migrations: [
    { tag: "v1", new_sqlite_classes: ["PairRoom"] },
    { tag: "v2", new_sqlite_classes: ["GroupRoom"] },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
