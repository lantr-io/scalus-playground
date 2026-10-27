// Module workers must be same-origin, but the toolchain may be hosted elsewhere (VITE_TOOLCHAIN_URL).
// This shim runs the toolchain's worker.js from wherever the manifest lives. worker.js reads the
// same ?manifest= parameter from this script's URL and resolves every asset against the manifest.
const manifest = new URL(self.location.href).searchParams.get("manifest");
await import(new URL("../worker.js", manifest).href);
