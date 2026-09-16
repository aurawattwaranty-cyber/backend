import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import {
  adoptOrphanModels,
  createSeries,
  deleteSeries,
  getSeries,
} from "../services/series.service.js";
import {
  createProductModel,
  deleteProductModel,
  updateProductModel,
} from "../services/products.service.js";

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
    await deleteSeries(String(req.params.id), String(req.body?.confirmationName ?? ""));
    res.status(204).send();
  }),
);

/* ------------------------------------------------------------------ *
 * Models within a series
 *
 * Series → Model → Warranty period. The term lives on the model because two
 * models in one series can carry different cover.
 * ------------------------------------------------------------------ */

seriesRouter.post(
  "/adopt-orphans",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await adoptOrphanModels());
  }),
);

seriesRouter.post(
  "/:id/models",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const created = await createProductModel({
      ...(req.body ?? {}),
      seriesId: String(req.params.id),
    });
    res.status(201).json({ item: created });
  }),
);

seriesRouter.patch(
  "/:id/models/:modelId",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = await updateProductModel(String(req.params.modelId), req.body ?? {});
    res.json({ item: updated });
  }),
);

seriesRouter.delete(
  "/:id/models/:modelId",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deleteProductModel(String(req.params.modelId));
    res.status(204).send();
  }),
);
