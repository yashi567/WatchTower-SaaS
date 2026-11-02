import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "worker" } }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              "react-vendor": ["react", "react-dom", "react-router-dom"],
              query: ["@tanstack/react-query"],
            },
          },
        },
      },
    },
  },
});
