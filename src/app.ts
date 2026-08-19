import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmetImport from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

const helmet = helmetImport as typeof import("helmet").default;

export function createApp() {
  const app = express();

  app.set("trust proxy", true);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan("dev"));

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "aurawatt-warranty-backend",
      version: "1.0.0",
      apiBase: "/api",
    });
  });

  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
