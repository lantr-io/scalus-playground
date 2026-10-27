# Scalus Playground

Write Cardano smart contracts in Scala with [Scalus](https://scalus.org), compile them to Plutus
UPLC, and evaluate them – entirely in your browser. Source of play.scalus.org.

Nothing runs on a server. The Scala 3 compiler, with the Scalus compiler plugin linked in, runs as
WebAssembly in a Web Worker. Your program is linked by the Scala.js linker in the same worker and
runs in the page.

```
Scala source ─▶ scalac + Scalus plugin (Wasm) ─▶ .sjsir ─▶ Scala.js linker (Wasm) ─▶ JS ─▶ run
                                                                 ▲
                                    Scalus + PlutusVM IR ────────┘
```

## Status

Early prototype.

| Works | Not yet |
|---|---|
| Compile `@Compile` validators and `compileWithOptions` expressions | `PlutusV3.compile` (needs macro expansion in the browser) – use `Playground.v3` |
| `TxBuilder` draft transactions and their script contexts | Scalus tests |
| UPLC, double-CBOR hex, script size | Formatting |
| Evaluate with PlutusVM, budget table | Firefox and Safari not tested (needs Wasm JSPI) |
| Errors as editor squiggles, live type-checking, share links | |

Needs a browser with WebAssembly GC, exception handling and JSPI: Chrome or Edge 137+.

## How it stays fast

The first compilation is the slow one: it downloads the toolchain, then warms up the compiler and
the linker. The playground starts it in the background as soon as the page loads, on whatever is in
the editor, and keeps the result. Pressing Run on that code shows the result at once; after edits,
the warm compiler and linker take a few seconds. Pausing while typing triggers a background
type-check, so errors show up without pressing anything.

Note: the background run executes the editor's code on page load, including code from a shared
link. It runs in a Web Worker, and its output is not shown until you press Run.

## Toolchain

The compiler comes from [lantr-io/scala3](https://github.com/lantr-io/scala3/tree/scalus-wasm),
branch `scalus-wasm`: Sébastien Doeraene and Patrick Gilliard's Scala.js build of the Scala 3
compiler (via [univalence-xyz/scala3-on-wasm](https://github.com/univalence-xyz/scala3-on-wasm)),
plus the Scalus plugin. Each release pins a Scalus commit. `TOOLCHAIN_VERSION` picks the release.

The toolchain (~140 MB) and the UI (~0.5 MB) deploy separately. `VITE_TOOLCHAIN_URL` names the
folder holding the toolchain's `worker.js`, on any origin that sends `Access-Control-Allow-Origin`
(GitHub Pages does). Without it, the UI expects the toolchain in `public/toolchain/` on the same
origin, which is what `npm run fetch-toolchain` sets up for local development.

## Development

```bash
npm install
npm run fetch-toolchain      # or: TOOLCHAIN_DIR=<scala3>/compiler/browser-ide npm run fetch-toolchain
npm run dev                  # http://localhost:5173
# or, with a toolchain served elsewhere: VITE_TOOLCHAIN_URL=http://localhost:8768/browser-ide/ npm run dev
```

Examples live in `src/scala/`. `src/scala/Playground.scala` is compiled with every program and
provides `Playground.v3`, `Playground.lockedUtxo`, `tx.scriptContextV3`, `Party`,
`Playground.show` and `Playground.budget`.

## Deploy

Pushing to `main` builds the UI and deploys it to GitHub Pages. The toolchain is not part of this
site: the build points at `https://lantr.io/scala3/toolchain/<TOOLCHAIN_VERSION>/browser-ide/`,
which lantr-io/scala3 publishes for each `scalus-toolchain-v*` tag. To move to a new toolchain,
change `TOOLCHAIN_VERSION`.
