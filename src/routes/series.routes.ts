import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { createSeries, deleteSeries, getSeries } from "../services/series.service.js";

export const seriesRouter = Router();

seriesRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await getSeries());
  }),
);

seriesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.status(201).json({ item: await createSeries(req.body ?? {}) });
  }),
);

seriesRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    deleteSeries(String(req.params.id), String(req.body?.confirmationName ?? ""));
    res.status(204).send();
  }),
);
