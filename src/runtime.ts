import { initializeStore } from "./data/store.js";
import { assertJwtConfiguration, ensureBootstrapAdmin } from "./services/auth.service.js";

let backendReadyPromise: Promise<void> | null = null;

export function ensureBackendReady(): Promise<void> {
  backendReadyPromise ??= (async () => {
    await initializeStore();
    assertJwtConfiguration();
    await ensureBootstrapAdmin();
  })();

  return backendReadyPromise;
}
