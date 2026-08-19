import { initializeStore } from "./data/store.js";
import { ensureBootstrapAdmin, initializeAuthSessions } from "./services/auth.service.js";

let backendReadyPromise: Promise<void> | null = null;

export function ensureBackendReady(): Promise<void> {
  backendReadyPromise ??= (async () => {
    await initializeStore();
    await ensureBootstrapAdmin();
    await initializeAuthSessions();
  })();

  return backendReadyPromise;
}
