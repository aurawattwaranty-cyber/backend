import "dotenv/config";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { ensureBackendReady } from "./runtime.js";

const app = createApp();

async function start() {
  await ensureBackendReady();
  const server = app.listen(config.port, () => {
    console.log(`Aurawatt backend listening on http://localhost:${config.port}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${config.port} is already in use. Stop the process using it, or change PORT in backend/.env.`,
      );
    }
    console.error(error);
    process.exit(1);
  });
}

void start().catch((error) => {
  console.error(error);
  process.exit(1);
});
