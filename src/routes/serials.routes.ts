import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  bulkImportSerials,
  createSerial,
  getSerialCounts,
  getSerials,
  previewBulkImport,
  validateSerial,
} from "../services/serials.service.js";

export const serialsRouter = Router();

serialsRouter.post(
  "/validate",
  asyncHandler(async (req, res) => {
    const result = await validateSerial(String(req.body?.serial ?? ""));
    res.json(result);
  }),
);

serialsRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 15);
    const items = await getSerials({
      search: String(req.query.search ?? ""),
      status:
        req.query.status === "available" || req.query.status === "registered"
          ? req.query.status
          : "all",
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 15,
    });
    res.json(items);
  }),
);

serialsRouter.get(
  "/counts",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await getSerialCounts());
  }),
);

serialsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const created = await createSerial(req.body ?? {});
    res.status(201).json({ item: created });
  }),
);

serialsRouter.post(
  "/bulk/preview",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const preview = await previewBulkImport({
      fileName: String(req.body?.fileName ?? "serials.csv"),
      content: String(req.body?.content ?? ""),
      encoding: req.body?.encoding === "base64" ? "base64" : "text",
    });
    res.json(preview);
  }),
);

serialsRouter.post(
  "/bulk/import",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await bulkImportSerials(req.body ?? {});
    res.json(result);
  }),
);
