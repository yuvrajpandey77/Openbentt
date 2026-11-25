# Before/after benchmarks (Phase C/F)

Date: 2026-11-24. All numbers were measured on the same Linux/Wayland host
with software rendering, Node v20.20.2, Electron 32.3.3, built `dist/` loaded
through `app://openbentt`. Every run used an isolated `--user-data-dir`.

**Honest headline:** startup did not materially change. The largest measurable
changes in the earlier audit were fewer eager resources and crash containment;
this batch added instrumentation and contract fixes, not a load-path
optimization. Where metrics differ in definition, no before/after comparison
is claimed.

## Inputs

- "Before" baseline: `docs/AUDIT_PERFORMANCE_RELIABILITY.md` §3, raw
  `/tmp/opencode/baseline7.json` and `/tmp/opencode/final-profile.json`.
- "After": `scripts/perf/startup-profile.mjs`,
  `/tmp/opencode/startup-profile-final.json` (2 cold + 2 warm iterations, final
  build); `scripts/perf/notebook-profile.mjs`,
  `/tmp/opencode/notebook-profile-final.json` (4 seeded scenarios).
- Harnesses: `scripts/perf/app-profile.mjs`, `scripts/perf/startup-profile.mjs`,
  `scripts/perf/notebook-profile.mjs`.

## Startup: cold and warm

| Metric (ms) | Before baseline | After — cold (2 runs) | After — warm (2 runs) | Reading |
| --- | --- | --- | --- | --- |
| `cdpReadyMs` | 329 | 324, 322 | 328, 321 | Unchanged within noise. |
| `pageAttachedMs` | 836 | 830, 809 | 819, 801 | Slightly lower warm values; small sample. |
| DOMContentLoaded | 374 | 374, 374 | 366, 370 | No meaningful change. |
| Load event | — | 377, 375 | 367, 371 | Measured only in the new harness. |
| Sidebar ready | 994 | 976, 944 | 959, 940 | ~2–5% lower, not a proven improvement. |
| Startup resource requests | 4 | 2 | 2 | Confirmed reduction from the earlier lazy-loading change. |
| JS heap at measurement | ~31.7 MB | 28.4, 31.5 MB | 32.0, 29.4 MB | Noise-level variation. |
| Page errors | service-worker `InvalidStateError` | none | none | Fixed in the earlier audit. |

The earlier audit's post-fix warm `cdpReadyMs` was 338/332 ms and sidebar
ready 1029/973 ms. Current warm values (321–328 ms / 940–959 ms) are in the
same range; first-run variance remains larger than any code-level delta.

## Notebook: comparable and non-comparable numbers

The legacy harness reported "Notebook click → ready" as 48 ms / ~1550 ms
(two different measurements). The new collector reports a single defined
`navigation initiated → notebook interactive` interval, so those figures are
**not directly comparable**. The table below is a current measurement, not an
improvement claim.

| Scenario | nav → interactive, cold / warm (ms) | nav → route mount, cold / warm (ms) | startup DB round trip (ms) |
| --- | --- | --- | --- |
| empty | 264.5 / 203.6 | 183.8 / 116.2 | 4.7 |
| existing (~24.5k draft chars) | 258.9 / 151.0 | 175.1 / 82.7 | 2.4 |
| large (~400.4k draft chars) | 328.3 / 207.3 | 194.4 / 106.0 | 5.3 |
| PDF-heavy (24-page PDF) | 338.5 / 164.8 | 209.1 / 93.1 | 14.1 |

PDF open path (final run): document opened → first page rendered **48.4 ms**;
navigation initiated → interactive **244.3 ms**. No optimization was applied
to these paths.

## Startup critical path and service classification (Phase F)

`electron/main.mjs` now records the main-process critical path, and
`src/main.tsx` / `src/App.tsx` record renderer marks:

| Segment | Measured range | Classification |
| --- | --- | --- |
| Main process total before `createWindow()` | 27.1–29.2 ms | **Essential**: menu, IPC handler registration, app protocol handler. |
| `createWindow()` | 21.1–22.5 ms | **Essential**: BrowserWindow + preload. |
| `cdpReadyMs` | 321–328 ms | Electron/Chromium startup; not app JS. |
| Renderer entry → first frame | ~3–107 ms across runs | **Essential**: storage migration, root render. |
| Providers mounted | 382–392 ms after time origin | **Mixed**: UI providers; heavy services are not started here. |
| Sidebar ready | 940–976 ms | Usable UI threshold in these runs. |

Essential services are the app protocol handler, window creation, the bridge,
and the providers required for onboarding/chat routing. Optional or heavy
services — PDF.js, mathjs, charts, Notebook/Projects/Documents route bundles,
local GGUF/Ollama runtime `ensure`, LaTeX toolchains — are registered as IPC
handlers at startup but are **not initialized** until a user action or route
needs them. This is corroborated by only 2 startup resource requests and zero
PDF/LaTeX/model downloads during the startup profile. No artificial delay or
idle-wait was introduced to make those services appear later.

The remaining gap between `providersMounted` (~390 ms) and sidebar ready
(~940–976 ms) is the largest unattributed renderer interval. It is reported as
unexplained rather than assigned to a guessed cause; route-level provider
splitting remains possible debt, but no change was made without evidence.

## Reproduction

```bash
npm run build
node scripts/perf/startup-profile.mjs /tmp/opencode/startup-profile-final.json 2
node scripts/perf/notebook-profile.mjs /tmp/opencode/notebook-profile-final.json
```

Single-machine, small-sample measurements. No fleet-wide target or speedup
claim is made from them.
