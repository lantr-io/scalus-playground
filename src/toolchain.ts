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
}

export interface Timing {
  durationMs: number;
}

type Pending = { resolve: (r: Result) => void; reject: (e: Error) => void };

export class Toolchain {
  readonly ready: Promise<void>;
  onStatus: (text: string) => void = () => {};
  onTiming: (timing: Timing) => void = () => {};

  private worker: Worker;
  private pending: Pending | null = null;

  constructor(baseUrl: string) {
    this.worker = new Worker(new URL("worker.js", baseUrl), { type: "module" });
    this.ready = new Promise((resolve, reject) => {
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
            this.onTiming({ durationMs: m.durationMs });
            break;
          case "run-result":
          case "awaiting-input":
            this.settle((p) => p.resolve({ ok: m.ok ?? true, output: m.output ?? "", diagnostics: m.diagnostics ?? [] }));
            break;
          case "compile-result":
            this.onTiming({ durationMs: m.durationMs });
            this.settle((p) =>
              p.resolve({
                ok: m.ok,
                output: m.error ?? (m.compilerLog ?? []).join("\n"),
                diagnostics: m.diagnostics ?? [],
              }),
            );
            break;
        }
      });
    });
  }

  /** Compiles, links and runs the `@main` entry point. */
  run(files: SourceFile[]): Promise<Result> {
    return this.request({ type: "run", files });
  }

  /** Type-checks and compiles without running. */
  check(files: SourceFile[]): Promise<Result> {
    return this.request({ type: "compile", files });
  }

  private async request(message: object): Promise<Result> {
    await this.ready;
    if (this.pending) throw new Error("The compiler is busy.");
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
