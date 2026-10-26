import { defineConfig } from "vite";

export default defineConfig({
  // The toolchain under public/toolchain is served as-is; it has its own module graph.
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
});
