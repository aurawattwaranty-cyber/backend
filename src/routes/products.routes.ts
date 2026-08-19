import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import {
  createProductModel,
  getProductModels,
  getProductSeries,
  updateProductModel,
} from "../services/products.service.js";

export const productsRouter = Router();

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const activeOnly = String(req.query.activeOnly ?? "false") === "true";
    const productType = req.query.productType ? String(req.query.productType) : undefined;
    const options: Parameters<typeof getProductModels>[0] = { activeOnly };
    if (productType === "inverter" || productType === "battery") {
      options.productType = productType;
    }
    const models = await getProductModels(options);
    res.json({ items: models });
  }),
);

productsRouter.get(
  "/series",
  asyncHandler(async (_req, res) => {
    res.json({ items: await getProductSeries() });
  }),
);

productsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const created = await createProductModel(req.body ?? {});
    res.status(201).json({ item: created });
  }),
);

productsRouter.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = await updateProductModel(String(req.params.id), req.body ?? {});
    res.json({ item: updated });
  }),
);
