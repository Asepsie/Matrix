# ARCHITECTURE — Project Matrix

Minimal context for future sessions. Add new sections as other areas get touched;
keep entries short — record what is *non-obvious from the code*, not a full tour.

---

## Data & persistence

Three persistence layers with **two different identity models**. This split is the
source of most data bugs.

| Layer | Where | Keyed by | Holds |
|-------|-------|----------|-------|
| Main state | localStorage `eim_v4` (`SK`) | — (whole arrays/objects) | `engineers[]`, `projects[]`, `allocRows[]`, placements, axis/UI |
| Photos | IndexedDB `EIM_Photos` + in-memory `_photoCache` | `String(eng.id)` | compressed JPEG dataURLs |
| Talent | IndexedDB `EIM_TalentData` | inner keys = `eng.id` | nine-box / disc placements, nbYear |
| Snapshots | IndexedDB `eim_snaps` (index + data stores) | snapshot `id` (Date.now) | time-travel copies of main state |

### Key facts (non-obvious)

- **`eng.id` is a per-dataset sequential counter** (`nextEngId`), **not** globally
  unique. Two different backups both have engineers `1,2,3…` referring to different
  people. IndexedDB is per-origin and dataset-independent, so id-keyed blobs
  (photos, placements) collide across datasets unless restore replaces them.
- **Photos live only in IndexedDB**, not in main state. On save, `idcard.photo` is
  stripped to `''` and the dataURL is pushed to `EIM_Photos`. `idbGetPhoto(id)` is a
  sync cache read (safe during render); `idbFetchPhoto` is the async fallback.
- **Snapshots do NOT carry photos** — they share the live `EIM_Photos` store within
  the same dataset. Never clear the photo store on snapshot restore (it would wipe
  every photo). Snapshots are intra-dataset time-travel only.
- **Full backups DO carry photos** — `exportFullBackup` embeds the whole
  `_photoCache` as `_photos`. A full-backup restore is a dataset *swap*.
- IndexedDB is per-origin = tied to the exact HTML file location. Moving/renaming
  `matrix.html` creates a new origin and the photo DB looks empty (recovery UI:
  `idbShowRecovery`).

### The restore invariant

A restore that swaps datasets (full backup) **must replace, not merge** every
id-keyed side-store, because the incoming engIds collide with the previous
dataset's. Merge = "wrong face on the wrong person".

- `importFullBackup` ([src/sections/backup.js](src/sections/backup.js)) uses
  `idbReplaceAllPhotos(photos)` (clears store + cache, writes only the backup's
  photos) and calls `talentIdbSave()` so `EIM_TalentData` matches the new dataset.
- `idbReplaceAllPhotos` rebuilds the cache from the photos map directly — never via
  `openCursor` (that would re-read ghost rows).
- `idbSavePhoto` is merge-only (PUT one key) — correct for normal editing, wrong for
  restore.

### Known remaining risk (not yet fixed)

The root cause — sequential `eng.id` instead of a globally unique `uid` — is still
present. Tier-1 fix makes restore authoritative but depends on every restore path
getting replace-semantics right. Notably `handleSnapImport`
([src/core/persist.js](src/core/persist.js)) can import a *full project JSON* as a
snapshot, which then restores via `restoreSnap` (no photo replace) — still
vulnerable. Durable fix (Tier 2): add per-engineer `uid`, key photos/placements by
it, migrate `id → uid`.

### Files

- [src/core/photo.js](src/core/photo.js) — photo IDB (`EIM_Photos`) + talent IDB
  (`EIM_TalentData`) CRUD, cache, compression, boot/migrate.
- [src/core/persist.js](src/core/persist.js) — localStorage save/load/sanitise,
  snapshot system (capture/restore/diff/export).
- [src/sections/backup.js](src/sections/backup.js) — full backup + roster
  export/import.
- [src/data/model.js](src/data/model.js) — `make*()` factories; the one place to add
  fields (sanitise/add/restore all flow through them).

---

## AI advisor (in-browser LLM)

All in [src/sections/ai.js](src/sections/ai.js). Header button `#ai-btn` →
`aiOpenChat()`. Runs a quantised LLM **entirely client-side via WebLLM + WebGPU** —
no backend, no API key, no data leaves the browser.

### Key facts (non-obvious)

- **Nothing is bundled.** The WebLLM library is `import()`-ed at runtime from a CDN
  (`AI_WEBLLM_CDN`, esm.run); model weights stream from **public/ungated Hugging
  Face** repos with **no credentials**. The browser caches weights (Cache API), so
  after the first download it works **offline**. `matrix.html` stays tiny.
- **Two metadata sources.** `AI_MODELS` is a curated shortlist (params + approx
  download size — *not* in WebLLM's config). VRAM + availability come live from
  `prebuiltAppConfig.model_list` (`aiVerifyAvailability` overwrites `vramGB`). A
  curated `id` MUST match a registry `model_id` or it shows "unavailable".
- **WebGPU required.** `aiHasWebGPU()` gates everything; no WebGPU → Select disabled
  with a notice. Works in Chrome/Edge, not older browsers.
- **Pre-flight before download.** `aiSelectModel` → `aiPreflight(model)` →
  `aiShowPreflight` modal before any load. It `requestAdapter()`s AND **actually
  `requestDevice()`s** (then destroys it) — this is essential: `requestAdapter`
  succeeds on a broken driver, but `requestDevice` is what throws
  `DXGI_ERROR_DEVICE_REMOVED` (D3D12 create-command-queue failure). A reject, or a
  device that's immediately `.lost`, → **block** with driver guidance (update driver,
  restart browser, check chrome://gpu). Also blocks on software-fallback adapters,
  warns on big-model-vs-small-buffer. Verdicts: block / warn / ok; only ok/warn show
  a load button → `aiProceedLoad` → `aiSetSavedModel` + `aiLoadModel`. Browsers don't
  expose total VRAM, so the shown numbers are buffer LIMITS, not free VRAM (the modal
  says so). Caveat: the device test consumes a throwaway adapter+device; WebLLM later
  requests its own fresh adapter, so no conflict.
- **Engine lifecycle is module state**, not persisted: `_aiEngine` (loaded engine),
  `_aiEngineModel` (its id), `_aiLoading`. Only the *chosen model id* persists, in
  localStorage `eim_ai_model` (`AI_MODEL_KEY`). On a fresh load the engine is NOT
  auto-loaded — `aiOpenChat` offers to (re)load the saved model on demand (cheap if
  cached). Loading is heavy, so it's always user-initiated.
- **System prompt = role + legend + data.** `aiSystemPrompt()` = `AI_ROLE`
  (instructions) + `AI_LEGEND` (a STATIC glossary — grade 1–11, comparatio,
  potential, the 9 nine-box cell meanings, skill levels, etc.) + `aiBuildContext()`.
  The legend exists because the model knows HR concepts generally but NOT *this
  tool's* scales/labels; spell them out or it guesses wrong. Keep it tight — it
  shares the ~4k-token window with the data.
- **Context is scope-aware (`_aiScope = {engIds, projIds}`, ids as strings).** A
  pre-chat menu (`aiOpenScope`) lets the user tick specific people/projects. With a
  selection, `aiBuildContext` emits FULL detail for those entities **plus their
  connections** (`aiPersonDeep` adds allocations/successor/trajectory; `aiProjectDeep`
  adds the allocated team) — and drops the broad overview. With nothing ticked it
  emits `aiOverview()` (people capped 60, projects 40). 9000-char hard cap either
  way. The menu shows a live token estimate so the user sees the budget. This is the
  key optimisation: focusing 1 person is ~150 tokens vs ~1700 for the whole org.
- **Flow:** header `#ai-btn` → `aiOpenChat` (router) → ensures engine (load if
  needed) → `aiOpenScope` (context menu) → `aiStartChat` (chat dialog). Both the
  scope menu and the chat header have a **⚙ Model** button → `aiShowModelPicker` to
  switch models (picking a different one → pre-flight → `reload`). `aiResolveEng()`
  turns manager/reportsTo id refs into names.
- **One AI dialog at a time (z-index trap).** Picker `z920` < scope `z925` < chat
  `z930` < preflight `z935`. Opening a lower-z dialog while a higher one is up makes
  it render hidden *behind* — this caused "the model can't be changed" (⚙ opened the
  picker behind the chat). So `aiShowModelPicker`/`aiOpenScope`/`aiStartChat` each
  close the other dialogs first. The picker is deliberately NOT closed during a load
  (progress renders in its `#ai-model-foot`).
- **Engine lifecycle is module state**, not persisted: `_aiEngine`, `_aiEngineModel`,
  `_aiLoading`. Only the chosen model id persists (localStorage `eim_ai_model`).
  Engine is never auto-loaded on boot (heavy) — always user-initiated.
- **SINGLETON engine + `reload()` — do NOT call `CreateMLCEngine` more than once.**
  `aiGetEngine()` lazily constructs ONE `new MLCEngine(...)`; `aiLoadModel` switches
  models via `engine.reload(id)`. Calling `CreateMLCEngine` again disposes the prior
  engine's GPU device → `Object has already been disposed`, then `Model not loaded`
  on the next request. This was a real bug; keep the singleton.
- **Stall watchdog.** `reload()`/fetch has no timeout, so a hung shard shows no
  error. `aiStartStallWatch` polls during load; if pct AND text are unchanged for
  `AI_STALL_MS` (45s) it shows a "may be stalled — reload to resume from cache" hint
  with a reload button. Any change in pct *or* the MB-counter text resets the clock
  (a flat rounded % mid-shard is not a stall). Cleared on success/failure.
- **GPU-error recovery (two tiers) + `exit_on_context_lost`.** `aiChatSend` routes
  completions through `aiRunStream`. On a **mild** lifecycle error (`aiIsLifecycleErr`:
  disposed / not loaded / tokenizer deleted) it `aiHardReset()`s and rebuilds a
  **fresh** engine via `aiGetEngine` + `reload`, retrying ONCE. On a **removed device**
  (`aiIsDeviceLost`: `DEVICE_REMOVED` / `requestDevice` / OOM / DXGI) it does NOT retry
  — on many Windows/NVIDIA setups chrome://gpu shows the **`exit_on_context_lost`**
  workaround, meaning a lost device kills the whole GPU process; nothing in-page can
  recover it. Instead it resets, shows `aiErrorHint` guidance, and surfaces a **↻
  Reload page** banner (`aiShowChatReload`, `#ai-chat-error`). Generic errors (network)
  are shown but don't reset the engine. The classic repro: model loads, first message
  works, the *second* (longer) generation trips a TDR/context-loss → device removed.
- **Chat survives the forced reload.** Because reload is the only recovery, the
  conversation + scope + model are saved to sessionStorage (`AI_CHAT_KEY`) on every
  turn (`aiPersistChat`) and restored after the model reloads (`aiRestoreChat`, called
  in `aiLoadModel`'s success). `⚠`/`↻` status messages are filtered out on restore.
- **Per-turn prompt is capped** (`AI_HISTORY_MAX=6` turns; `aiBuildContext` data cap
  6000 chars) to bound VRAM/compute and fit the conservative context window below.
- **Per-turn state reset.** `aiRunStream` calls `engine.resetChat()` (guarded) before
  each `chat.completions.create`. We send the full message array every turn (stateless
  usage), so clearing the KV-cache/state is safe and removes cross-turn engine state —
  aimed at the deterministic 2nd-turn device drop (1st turn works, 2nd fails with
  identical prompt size, which points to carried state rather than prompt length/TDR).
- **TDR-safe load (`aiReloadModel` + `AI_SAFE_CHAT_OPTS`).** All loads go through
  `aiReloadModel`, which reloads with `{context_window_size:4096, prefill_chunk_size:
  256}`. The small `prefill_chunk_size` is the key: it splits prompt processing into
  many short GPU dispatches so no single one exceeds Windows' ~2s TDR (the cause of
  the 2nd-turn `DEVICE_REMOVED`). If a model rejects the opts (e.g. sliding-window
  models like Phi-3.5), it falls back to a plain `reload`; device-loss errors are not
  retried. `DEVICE_REMOVED` is still ultimately a VRAM/driver matter — steer users to
  Llama 3.2 1B and a fresh GPU process (full browser restart) if it persists.
- **Streaming chat.** `aiRunStream` calls `engine.chat.completions.create({stream:
  true})` and consumes the async iterable in an `async` IIFE (`for await`), updating
  the last bubble (`#ai-bub-last`) per token. The system prompt (with fresh,
  scope-aware context) is rebuilt and prepended on every send; `_aiMessages` holds
  only user/assistant turns, so changing scope mid-chat just changes the next turn.

### Build note

`ai.js` uses `import()`, `async`, and `for await` — all valid in the classic-script
bundle and confirmed to pass the `vm.Script` parse invariant. Keep dynamic imports
as `import(VAR)` (not `import x from '…'`, which build.js strips).

### Status

Done: model picker + download-with-progress, static legend, scope menu with
full/connected drill-down, streaming chat.

### Optional TODO (not started, no particular order)

- [ ] **Real end-to-end download/inference test.** The whole flow is verified with a
      stubbed engine only; a real run pulls 1–2 GB onto an actual GPU. The plumbing
      is identical to the stub path, but real weights are the real test.
- [ ] **Markdown rendering of replies.** Currently plain text via `escH` in
      `aiRenderChat`/`aiRenderChatStreaming`; bullets/headings would render nicer.
- [ ] **Per-engineer "draft development plan" action** in the ID card — pre-tick that
      person in `_aiScope`, open the chat, and send a canned prompt.
- [x] **Persist chat history** — done (`aiPersistChat`/`aiRestoreChat` via
      sessionStorage `AI_CHAT_KEY`; restores after a forced reload).
- [ ] **Larger context budget for big-context models.** The 9000-char cap in
      `aiBuildContext` is conservative for ~4k-token models; raise it if a
      bigger-context model is selected.
