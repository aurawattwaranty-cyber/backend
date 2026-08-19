import { createApp } from "../src/app.js";
import { ensureBackendReady } from "../src/runtime.js";
import { createServerlessHandler } from "../src/vercel-handler.js";

const app = createApp();
const ready = ensureBackendReady();

export default createServerlessHandler(app, ready);
