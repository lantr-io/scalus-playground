import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { scala } from "@codemirror/legacy-modes/mode/clike";
import { oneDark } from "@codemirror/theme-one-dark";
import { setDiagnostics, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { keymap } from "@codemirror/view";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

import { Toolchain, type Diagnostic, type Result } from "./toolchain";
import { parseOutput, type ParsedOutput } from "./output";
import { uplc } from "./uplc";
import playgroundPrelude from "./scala/Playground.scala?raw";
import helloCardano from "./scala/HelloCardano.scala?raw";
import expression from "./scala/Expression.scala?raw";
import "./style.css";

const MainFile = "Main.scala";
const examples: Record<string, string> = {
  "Hello Cardano validator": helloCardano,
  "Compile an expression": expression,
};

// Light or dark, following the system setting, as scalus.org does.
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
// One Dark's syntax colours on the page's own dark background (style.css --bg / --panel).
const darkBackground = EditorView.theme(
  { "&": { backgroundColor: "#111111" }, ".cm-gutters": { backgroundColor: "#111111" } },
  { dark: true },
);
const themeFor = () => (darkScheme.matches ? [oneDark, darkBackground] : []);
const editorTheme = new Compartment();
const uplcTheme = new Compartment();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status");
const runButton = $<HTMLButtonElement>("run");
const checkButton = $<HTMLButtonElement>("check");
const shareButton = $<HTMLButtonElement>("share");
const exampleSelect = $<HTMLSelectElement>("example");

// --- Editor -----------------------------------------------------------------

const editor = new EditorView({
  parent: $("editor"),
  state: EditorState.create({
    doc: initialSource(),
    extensions: [
      basicSetup,
      StreamLanguage.define(scala),
      editorTheme.of(themeFor()),
      lintGutter(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) scheduleCheck();
      }),
      keymap.of([
        { key: "Mod-Enter", run: () => (run(), true) },
        { key: "Mod-s", run: () => (share(), true) },
      ]),
    ],
  }),
});

// Dev builds expose the editor for browser tests.
if (import.meta.env.DEV) (window as any).__editor = editor;

function initialSource(): string {
  const hash = new URLSearchParams(location.hash.slice(1)).get("code");
  return (hash && decompressFromEncodedURIComponent(hash)) || helloCardano;
}

for (const name of Object.keys(examples)) exampleSelect.add(new Option(name, name));
exampleSelect.addEventListener("change", () => {
  setSource(examples[exampleSelect.value]);
  history.replaceState(null, "", location.pathname);
});

function setSource(text: string) {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
}

// --- Output panes -------------------------------------------------------------

const uplcView = new EditorView({
  parent: document.createElement("div"),
  state: EditorState.create({
    extensions: [basicSetup, uplcTheme.of(themeFor()), EditorState.readOnly.of(true), EditorView.lineWrapping, uplc],
  }),
});
darkScheme.addEventListener("change", () => {
  editor.dispatch({ effects: editorTheme.reconfigure(themeFor()) });
  uplcView.dispatch({ effects: uplcTheme.reconfigure(themeFor()) });
});
$("tab-uplc").append(uplcView.dom);

function setView(view: EditorView, text: string) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

function showTab(name: string) {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".tabs button"))
    b.classList.toggle("active", b.dataset.tab === name);
  for (const p of document.querySelectorAll<HTMLElement>(".tab"))
    p.hidden = p.id !== `tab-${name}`;
}
for (const b of document.querySelectorAll<HTMLButtonElement>(".tabs button"))
  b.addEventListener("click", () => showTab(b.dataset.tab!));

function render(result: Result, parsed: ParsedOutput) {
  $("console-text").textContent = parsed.console || (result.ok ? "(no output)" : "");
  setView(uplcView, parsed.uplc ?? "");
  $("cbor-text").textContent = parsed.cbor ?? "";
  $("size").textContent = parsed.size ? `${parsed.size} bytes` : "";
  $<HTMLButtonElement>("copy-cbor").hidden = !parsed.cbor;

  const rows = parsed.budget
    .map(
      (r) => `<tr class="${r.success ? "ok" : "fail"}"><td>${escape(r.label)}</td><td>${r.success ? "✓ success" : "✗ failure"}</td>
        <td>${Number(r.memory).toLocaleString()}</td><td>${Number(r.steps).toLocaleString()}</td><td>${escape(r.logs)}</td></tr>`,
    )
    .join("");
  $("budget-body").innerHTML = rows || `<tr><td colspan="5">No evaluations. Call Playground.budget(label, result).</td></tr>`;

  const problems = result.diagnostics.filter((d) => d.severity !== "info");
  $("problems-list").innerHTML =
    problems.map((d) => `<li class="${d.severity}">${escape(d.rendered || d.message)}</li>`).join("") || "<li>No problems.</li>";
  $("problems-count").textContent = problems.length ? String(problems.length) : "";

  const errorsOnly = !result.ok && !parsed.uplc && !parsed.budget.length;
  if (!result.ok && problems.length) showTab("problems");
  else if (!result.ok && !errorsOnly) showTab("console");
  else if (!result.ok) {
    $("console-text").textContent = result.output;
    showTab("console");
  } else showTab(parsed.uplc ? "uplc" : "console");
}

$("copy-cbor").addEventListener("click", () => navigator.clipboard.writeText($("cbor-text").textContent ?? ""));

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function markDiagnostics(diagnostics: Diagnostic[]) {
  const len = editor.state.doc.length;
  const marks: CmDiagnostic[] = diagnostics
    .filter((d) => d.file === MainFile && d.offset != null && d.severity !== "info")
    .map((d) => ({
      from: Math.min(d.offset!, len),
      to: Math.min(Math.max(d.endOffset ?? d.offset!, d.offset! + 1), len),
      severity: d.severity === "error" ? "error" : "warning",
      message: d.message,
    }));
  editor.dispatch(setDiagnostics(editor.state, marks));
}

// --- Compiler -----------------------------------------------------------------
//
// The first run is the slow one: download, cold compiler, cold linker. So we start it as soon as
// the compiler is ready, on whatever is in the editor, and keep the result. Pressing Run on the
// same source then shows it at once; on edited source the warm compiler and linker are fast.
// Edits also trigger a background type-check, so errors appear without pressing anything.

const toolchainBase = new URL(import.meta.env.VITE_TOOLCHAIN_URL ?? `${import.meta.env.BASE_URL}toolchain/browser-ide/`, location.href);
const manifestUrl = new URL("assets/manifest.json", toolchainBase).href;
const toolchain = new Toolchain(manifestUrl);
let foreground = false;
toolchain.onStatus = (text) => {
  if (foreground) statusEl.textContent = text;
};

const source = () => editor.state.doc.toString();
const files = (main: string) => [
  { path: "Playground.scala", content: playgroundPrelude },
  { path: MainFile, content: main },
];

/** Run results by source text. A run in progress is cached too, so Run can await it. */
const runs = new Map<string, Promise<Result>>();
function runSource(main: string): Promise<Result> {
  let result = runs.get(main);
  if (!result) {
    result = toolchain.run(files(main));
    runs.set(main, result);
    result.catch(() => runs.delete(main));
    if (runs.size > 20) runs.delete(runs.keys().next().value!);
  }
  return result;
}

statusEl.textContent = "Loading the Scala compiler (the first visit downloads ~140 MB)…";
// `PlutusV3.compile` is a macro. The worker expands macros by linking their Scala.js IR into the
// compiler, so it needs the Scalus jar's IR. The jar is on the compile classpath already, so the
// browser has it cached.
async function importScalusMacros(manifestUrl: string) {
  const manifest = await (await fetch(manifestUrl, { cache: "no-store" })).json();
  const entry = manifest.classpath.find((e: { path: string }) => /\/scalus_sjs1_3-[^/]*\.jar$/.test(e.path));
  if (!entry) throw new Error("The toolchain has no Scalus jar.");
  showScalusVersion(entry.path.match(/scalus_sjs1_3-(.+)\.jar$/)[1]);
  const bytes = new Uint8Array(await (await fetch(new URL(entry.url, manifestUrl))).arrayBuffer());
  await toolchain.importMacros("scalus-macros.zip", bytes);
}
const macrosReady = importScalusMacros(manifestUrl);

function showScalusVersion(version: string) {
  const badge = $<HTMLAnchorElement>("version");
  badge.textContent = `Scalus ${version}`;
  // Released versions are git tags; snapshot builds have no tag to point at.
  badge.href = /^\d+\.\d+\.\d+$/.test(version)
    ? `https://github.com/scalus3/scalus/tree/v${version}`
    : "https://github.com/scalus3/scalus/releases";
  badge.hidden = false;
}

toolchain.ready.then(
  async () => {
    setBusy(false);
    statusEl.textContent = "Preparing: compiling the example in the background…";
    await macrosReady.catch((e) => console.error("Scalus macros unavailable:", e));
    const warmed = source();
    runSource(warmed).then(
      (r) => {
        if (source() === warmed) markDiagnostics(r.diagnostics);
        if (!foreground) statusEl.textContent = "Ready. Run with Ctrl/Cmd+Enter.";
      },
      () => {},
    );
  },
  (e) => (statusEl.textContent = `Compiler failed to start: ${e.message}`),
);

function setBusy(busy: boolean) {
  runButton.disabled = checkButton.disabled = busy;
}

async function execute(action: "run" | "check") {
  if (runButton.disabled) return;
  setBusy(true);
  foreground = true;
  const main = source();
  const cached = action === "run" && runs.has(main);
  statusEl.textContent = action === "run" ? "Compiling and running…" : "Checking…";
  try {
    const result = await (action === "run" ? runSource(main) : toolchain.check(files(main)));
    if (source() === main) markDiagnostics(result.diagnostics);
    const took = `${(result.durationMs / 1000).toFixed(2)} s`;
    statusEl.textContent = !result.ok
      ? `Failed after ${took}. See Problems or Console.`
      : cached
        ? `Done (compiled in the background in ${took}).`
        : `Done in ${took}.`;
    render(result, action === "run" ? parseOutput(result.output) : { console: result.ok ? "No errors." : "", budget: [] });
  } catch (e) {
    statusEl.textContent = "The compiler crashed. Reload the page to restart it.";
    $("console-text").textContent = (e as Error).message;
    showTab("console");
  } finally {
    foreground = false;
    setBusy(false);
  }
}
const run = () => execute("run");
runButton.addEventListener("click", run);
checkButton.addEventListener("click", () => execute("check"));

// Background type-check after the user stops typing. Only the latest source is checked.
let checkTimer: number | undefined;
let checking = false;
function scheduleCheck() {
  clearTimeout(checkTimer);
  checkTimer = window.setTimeout(backgroundCheck, 800);
}
async function backgroundCheck() {
  if (checking) return scheduleCheck();
  const main = source();
  if (runs.has(main)) return;
  checking = true;
  try {
    const result = await toolchain.check(files(main));
    if (source() === main) markDiagnostics(result.diagnostics);
  } catch {
    // A crash shows up on the next Run.
  } finally {
    checking = false;
  }
}

// --- Share --------------------------------------------------------------------

function share() {
  const code = compressToEncodedURIComponent(editor.state.doc.toString());
  history.replaceState(null, "", `#code=${code}`);
  navigator.clipboard.writeText(location.href).then(() => (statusEl.textContent = "Link copied to clipboard."));
}
shareButton.addEventListener("click", share);

setBusy(true);
showTab("console");
