import { afterEach } from "vitest";

// Scoped to the app package: environmentMatchGlobs in the root vitest.config
// only runs packages/app/test/** under jsdom, so `document` only exists for
// those files. This is listed in setupFiles at the root (the only place
// Vitest reads it from), so it runs for every package — the guard keeps it
// a genuine no-op for pf2data and schema, which never import
// @testing-library/react and get no extra afterEach registered.
//
// Without this, @testing-library/react's own auto-cleanup never registers
// itself (it only does so when `afterEach` is already a global, and this
// repo doesn't set `test.globals`), so a test file whose tests call
// render() more than once leaks DOM across tests within that file.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);

  // jsdom itself provides no IndexedDB implementation, and persist.ts
  // (loadEncounter/loadPlayers/loadSettings and friends) is real I/O
  // against it — this polyfills `indexedDB` so those tests exercise the
  // real idb code path instead of every persistence test being reduced to
  // the pure `migrate()` helper.
  await import("fake-indexeddb/auto");
}
