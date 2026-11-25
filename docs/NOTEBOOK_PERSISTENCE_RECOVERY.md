# Notebook persistence and recovery (Phase B)

This document records the small, independently verifiable persistence batch for
notebook data in the desktop app. It covers explicit state reporting, atomic and
serialized writes, bounded retries, shutdown flushing, backup validation, and
fault-injection coverage.

## Scope

Changed files in this batch:

- `electron/researchDb.mjs` — persistence state machine, atomic write path,
  retries, shutdown flush, and validated backup restore.
- `electron/researchDb.test.mjs` — fault-injection and state-transition tests.
- `electron/researchProjectService.mjs` — one narrow
  `research:persistenceStatus` IPC handler.
- `electron/preload.cjs` — one narrow `persistenceStatus` bridge method.
- `src/components/PersistenceStatusBanner.tsx` — new desktop-only failure
  banner.
- `src/layouts/AppLayout.tsx` — mounts the banner exactly once.
- `docs/NOTEBOOK_PERSISTENCE_RECOVERY.md` — this report.

No commit was created. `package.json`, `electron/main.mjs`,
`electron/ipcAuthorization.mjs`, `scripts/check-electron-security.mjs`, and
other docs were not edited by this batch.

## Persistence state

`electron/researchDb.mjs` now exposes:

```js
getPersistenceStatus() // { state, lastError, lastSuccessAt, lastAttemptAt,
                       //   retryCount, hasUnsavedChanges }
getPersistenceError()  // string | null, kept for compatibility
flushPersistence()     // async, bounded wait, returns final status
retryPersistence()     // async manual retry, resets backoff
```

States:

- `clean` — last attempt wrote the exported database successfully.
- `pending` — in-memory mutations are waiting for the next-tick flush.
- `saving` — an atomic write attempt is in progress.
- `failed` — the last attempt failed; `hasUnsavedChanges` stays `true` so a
  failure is never reported as success.

Mutations are coalesced into one `process.nextTick` flush. The in-memory
sql.js database remains usable after a failed write; no exception is allowed to
escape into `nextTick` or quit handlers.

## Atomic write path

Every database write now:

1. Uses a unique temp file: `research.db.<pid>.<random>.tmp`.
2. Validates the exported bytes begin with `SQLite format 3\0`.
3. Writes the whole buffer, looping over short `fs.writeSync` returns.
4. Calls `fs.fsyncSync` on the file (directory fsync is best-effort).
5. Re-validates the temp file header.
6. Atomically renames the temp file over `research.db`.
7. Removes stale temp files from the same process.

A failed attempt leaves the previous database file untouched and a partial temp
file is cleaned up. `fs.writeSync` partial writes are handled instead of being
mistaken for a complete write.

## Retries and shutdown

- Automatic retries use bounded exponential backoff (40ms → 80ms → 160ms,
  capped at three retries).
- `retryPersistence()` cancels queued automatic retries, resets the backoff,
  and forces an immediate flush.
- `flushPersistence(timeoutMs)` is async and bounded (default 2000ms).
- `closeDb()` calls `flushPersistence()` before closing. If the final write
  fails, the in-memory database is kept alive for a later manual retry.
- A `force` argument on `closeDb(true)` exists only for test teardown; default
  production shutdown keeps unsaved in-memory state on failure.
- Once shutdown has been requested, no new automatic retry timer is scheduled.
- Any new mutation or manual retry re-enables automatic retries.

## Backup validation and recovery

- Restoring a corrupt `research.db` copies `research.db.bak` only after
  validating the backup's SQLite header; the copy is validated again before
  the atomic rename.
- If both the database and backup are invalid, `openDb()` throws and the
  persistence state becomes `failed` with an explicit `no valid backup` error.
  No fabricated success is reported.
- `backupDatabase()` writes a validated SQLite snapshot to a unique temp file
  and atomically renames it. It prefers the in-memory export (capturing queued
  changes) and otherwise uses an already-valid on-disk database. A corrupt
  database can never replace a valid backup.

## Renderer surfacing

`window.openbenttResearch.persistenceStatus()` is exposed through the existing
bridge. `PersistenceStatusBanner` polls it every two seconds in desktop mode
only, renders nothing on web or older builds without the method, and shows a
non-blocking failure banner when `state === "failed"`. It is mounted once from
`AppLayout`.

## Verification

Exact required command:

```text
node --test electron/researchDb.test.mjs
```

Final result:

```text
# tests 17
# suites 1
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 694.58433
```

Additional checks run after the final implementation:

```text
node --test electron/researchProjectService.test.mjs electron/researchVectorStore.test.mjs electron/researchJobQueue.test.mjs
# tests 12
# pass 12
# fail 0

npx tsc --noEmit --pretty false
(no output)

node scripts/check-electron-security.mjs && node scripts/check-electron-pack-files.mjs
Electron security check passed (nodeIntegration off, 8 bridges, 174 IPC registrations covered by 170 policy entries).
Electron pack manifest check passed (main-process src imports covered).
```

Fault-injection coverage includes EACCES, ENOSPC, partial/interrupted temp
writes, invalid SQLite exports, invalid database with a valid backup, corrupt
backup with corrupt database, shutdown during persistence, repeated failures
with bounded retries, and concurrent modifications coalescing into one write.
All monkey-patched `fs` functions are restored in `finally` blocks.

## Remaining gaps

- This batch does not edit `electron/main.mjs`; wiring an additional
  `await flushPersistence()` at the app quit call site is owned by another
  worker. `closeDb()` already flushes, so persistence is covered even without
  that separate call.
- The renderer polls status rather than receiving a push stream. This keeps the
  bridge narrow and diagnostics best-effort, at the cost of up to a two-second
  delay before the banner appears.
- Directory fsync is best-effort because it is not supported consistently on
  every platform. The file itself is always fsynced before rename.
