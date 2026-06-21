import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    // Mini Apps are served over HTTPS, not from Electron file://.
    base: "/",
    define: {
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: env.VITE_API_URL
        ? undefined
        : {
            "/api": {
              target: "http://127.0.0.1:10000",
              changeOrigin: true,
            },
          },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: false,
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
