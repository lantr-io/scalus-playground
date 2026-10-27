// Client for the Scala.js/Wasm compiler worker shipped in the Scalus toolchain release.
// Protocol: lantr-io/scala3 branch scalus-wasm, compiler/src-sjs/dotty/tools/browseride/BrowserIDEWorker.scala

export interface SourceFile {
  path: string;
  content: string;
}

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  rendered?: string;
  file?: string | null;
  line?: number | null;
  column?: number | null;
  offset?: number | null;
  endOffset?: number | null;
}

export interface Result {
  ok: boolean;
  output: string;
  diagnostics: Diagnostic[];
  durationMs: number;
}

type Pending = { resolve: (r: Result) => void; reject: (e: Error) => void };

/** One worker, one request at a time: requests queue up in call order. */
export class Toolchain {
  readonly ready: Promise<void>;
  onStatus: (text: string) => void = () => {};

  private worker: Worker;
  private pending: Pending | null = null;
  private lastDurationMs = 0;
  private queue: Promise<unknown> = Promise.resolve();

  /** @param manifestUrl absolute URL of the toolchain's assets/manifest.json, on any CORS-enabled origin */
  constructor(manifestUrl: string) {
    const shim = new URL(`${import.meta.env.BASE_URL}toolchain-worker.js`, location.href);
    shim.searchParams.set("manifest", manifestUrl);
    this.worker = new Worker(shim, { type: "module" });
    this.ready = new Promise((resolve, reject) => {
      this.worker.addEventListener("error", (e) => reject(new Error(e.message || "The compiler worker failed to load.")));
      this.worker.addEventListener("message", (event) => {
        const m = event.data;
        switch (m.type) {
          case "status":
            this.onStatus(m.text ?? m.output ?? "");
            break;
          case "ready":
            resolve();
            break;
          case "runtime-error": {
            const error = new Error(m.error);
            reject(error);
            this.settle((p) => p.reject(error));
            break;
          }
          case "compile-duration":
            this.lastDurationMs = m.durationMs;
            break;
          case "run-result":
          case "awaiting-input":
            this.settle((p) =>
              p.resolve({ ok: m.ok ?? true, output: m.output ?? "", diagnostics: m.diagnostics ?? [], durationMs: this.lastDurationMs }),
            );
            break;
          case "compile-result":
            this.settle((p) =>
              p.resolve({
                ok: m.ok,
                output: m.error ?? (m.compilerLog ?? []).join("\n"),
                diagnostics: m.diagnostics ?? [],
                durationMs: m.durationMs,
              }),
            );
            break;
        }
      });
    });
  }

  /** Compiles, links and runs the `@main` entry point. */
  run(files: SourceFile[]): Promise<Result> {
    return this.enqueue({ type: "run", files });
  }

  /** Type-checks and compiles without linking or running. */
  check(files: SourceFile[]): Promise<Result> {
    return this.enqueue({ type: "compile", files });
  }

  private enqueue(message: object): Promise<Result> {
    const result = this.queue.then(() => this.send(message));
    this.queue = result.catch(() => {});
    return result;
  }

  private async send(message: object): Promise<Result> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage(message);
    });
  }

  private settle(f: (p: Pending) => void) {
    const p = this.pending;
    this.pending = null;
    if (p) f(p);
  }
}
