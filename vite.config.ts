import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/ until a custom domain is set; CI passes the path.
  base: process.env.BASE_PATH ?? "/",
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
});
