import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmetImport from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { refreshFromStore } from "./data/store.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import { AppError } from "./utils/errors.js";

const helmet = helmetImport as unknown as typeof import("helmet").default;

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
        callback(
          new AppError(
            `CORS blocked for origin ${origin}`,
            403,
            "cors_blocked",
          ),
        );
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

  // Every serverless instance holds its own copy of the database. Picking up
  // any newer revision before the route runs is what keeps a warranty from
  // appearing on one request and vanishing on the next, depending on which
  // instance happened to answer.
  app.use("/api", (_req, _res, next) => {
    refreshFromStore().then(() => next(), next);
  });

  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
