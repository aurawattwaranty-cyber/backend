import { Router } from "express";
import { config } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "aurawatt-warranty-backend",
    timestamp: new Date().toISOString(),
    port: config.port,
  });
});
