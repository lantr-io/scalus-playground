/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the toolchain (the folder holding worker.js and assets/). Default: same origin. */
  readonly VITE_TOOLCHAIN_URL?: string;
}
