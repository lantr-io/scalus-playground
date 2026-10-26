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
      oneDark,
      lintGutter(),
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

const readOnly = (doc: string, language: Compartment, lang: any = []) =>
  new EditorView({
    parent: document.createElement("div"),
    state: EditorState.create({
      doc,
      extensions: [basicSetup, oneDark, EditorState.readOnly.of(true), EditorView.lineWrapping, language.of(lang)],
    }),
  });
const uplcView = readOnly("", new Compartment(), uplc);
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

const toolchain = new Toolchain(new URL(`${import.meta.env.BASE_URL}toolchain/browser-ide/`, location.href).href);
toolchain.onStatus = (text) => (statusEl.textContent = text);
let lastDurationMs = 0;
toolchain.onTiming = (t) => (lastDurationMs = t.durationMs);

statusEl.textContent = "Loading the Scala compiler (first visit downloads ~140 MB)…";
toolchain.ready.then(
  () => {
    statusEl.textContent = "Ready. Run with Ctrl/Cmd+Enter.";
    setBusy(false);
  },
  (e) => (statusEl.textContent = `Compiler failed to start: ${e.message}`),
);

function files() {
  return [
    { path: "Playground.scala", content: playgroundPrelude },
    { path: MainFile, content: editor.state.doc.toString() },
  ];
}

function setBusy(busy: boolean) {
  runButton.disabled = checkButton.disabled = busy;
}

async function execute(action: "run" | "check") {
  if (runButton.disabled) return;
  setBusy(true);
  statusEl.textContent = action === "run" ? "Compiling and running…" : "Checking…";
  try {
    const result = await (action === "run" ? toolchain.run(files()) : toolchain.check(files()));
    markDiagnostics(result.diagnostics);
    const took = `${(lastDurationMs / 1000).toFixed(2)} s`;
    statusEl.textContent = result.ok ? `Done in ${took}.` : `Failed after ${took}. See Problems or Console.`;
    render(result, action === "run" ? parseOutput(result.output) : { console: result.ok ? "No errors." : "", budget: [] });
  } catch (e) {
    statusEl.textContent = "The compiler crashed. Reload the page to restart it.";
    $("console-text").textContent = (e as Error).message;
    showTab("console");
  } finally {
    setBusy(false);
  }
}
const run = () => execute("run");
runButton.addEventListener("click", run);
checkButton.addEventListener("click", () => execute("check"));

// --- Share --------------------------------------------------------------------

function share() {
  const code = compressToEncodedURIComponent(editor.state.doc.toString());
  history.replaceState(null, "", `#code=${code}`);
  navigator.clipboard.writeText(location.href).then(() => (statusEl.textContent = "Link copied to clipboard."));
}
shareButton.addEventListener("click", share);

setBusy(true);
showTab("console");
