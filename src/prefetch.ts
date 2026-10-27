// Downloads the toolchain files into the browser cache before the compiler worker starts, so the
// page can show progress: the worker fetches the same URLs afterwards and gets them from the cache.

export interface Progress {
  loaded: number;
  total: number;
}

/** Every file the worker fetches during startup and the first compile and link. (The compiler IR is
 * left out: only user-defined macros need it, and the worker fetches it then.) */
export async function toolchainFiles(
  manifestUrl: string,
): Promise<{ urls: string[]; sizes: Map<string, number>; manifest: any }> {
  const manifest = await (await fetch(manifestUrl, { cache: "no-store" })).json();
  const at = (u: string) => new URL(u, manifestUrl).href;
  const compilerModule = at(manifest.compilerModule);
  const runtimeIR: string[] = Array.isArray(manifest.runtimeIR) ? manifest.runtimeIR : [manifest.runtimeIR];
  const urls = [
    new URL("main.wasm", compilerModule).href,
    ...manifest.classpath.map((e: { url: string }) => at(e.url)),
    ...runtimeIR.map(at),
  ];
  // Toolchains since v0.1.1 list file sizes, so progress has the right total from the start.
  const sizes = new Map<string, number>(Object.entries(manifest.sizes ?? {}).map(([u, n]) => [at(u), Number(n)]));
  return { urls, sizes, manifest };
}

/** Fetches all URLs in parallel, reporting bytes received so far against the announced sizes. */
export async function prefetch(
  urls: string[],
  knownSizes: Map<string, number>,
  onProgress: (p: Progress) => void,
): Promise<void> {
  const loaded = new Map<string, number>();
  const sizes = new Map(knownSizes);
  const report = () => {
    let l = 0;
    let t = 0;
    for (const url of urls) {
      const got = loaded.get(url) ?? 0;
      l += got;
      t += Math.max(sizes.get(url) ?? 0, got); // compressed transfers can exceed Content-Length
    }
    onProgress({ loaded: l, total: t });
  };
  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`${url}: ${response.status} ${response.statusText}`);
      if (!sizes.has(url)) sizes.set(url, Number(response.headers.get("content-length") ?? 0));
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded.set(url, (loaded.get(url) ?? 0) + value.byteLength);
        report();
      }
    }),
  );
}
