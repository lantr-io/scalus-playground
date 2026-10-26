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
| UPLC, double-CBOR hex, script size | Scalus tests |
| Evaluate with PlutusVM, budget table | Formatting |
| Errors as editor squiggles, share links | Firefox and Safari not tested (needs Wasm JSPI) |

Needs a browser with WebAssembly GC, exception handling and JSPI: Chrome or Edge 137+.

## Toolchain

The compiler comes from [lantr-io/scala3](https://github.com/lantr-io/scala3/tree/scalus-wasm),
branch `scalus-wasm`: Sébastien Doeraene and Patrick Gilliard's Scala.js build of the Scala 3
compiler (via [univalence-xyz/scala3-on-wasm](https://github.com/univalence-xyz/scala3-on-wasm)),
plus the Scalus plugin. Each release pins a Scalus commit. `TOOLCHAIN_VERSION` picks the release.

## Development

```bash
npm install
npm run fetch-toolchain      # or: TOOLCHAIN_DIR=<scala3>/compiler/browser-ide npm run fetch-toolchain
npm run dev                  # http://localhost:5173
```

Examples live in `src/scala/`. `src/scala/Playground.scala` is compiled with every program and
provides `Playground.v3`, `Playground.show` and `Playground.budget`.

## Deploy

Pushing to `main` builds the site and deploys it to Cloudflare Pages (project `scalus-playground`).
Set the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
