import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import {
  createPhotoRequirement,
  deletePhotoRequirement,
  getPhotoRequirements,
  movePhotoRequirement,
  updatePhotoRequirement,
} from "../services/photo-requirements.service.js";

export const photoRequirementsRouter = Router();

photoRequirementsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ items: await getPhotoRequirements() });
  }),
);

photoRequirementsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const created = await createPhotoRequirement(req.body ?? {});
    res.status(201).json({ item: created });
  }),
);

photoRequirementsRouter.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = await updatePhotoRequirement(String(req.params.id), req.body ?? {});
    res.json({ item: updated });
  }),
);

photoRequirementsRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deletePhotoRequirement(String(req.params.id));
    res.status(204).send();
  }),
);

photoRequirementsRouter.post(
  "/:id/move",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const direction = req.body?.direction === "down" ? "down" : "up";
    const items = await movePhotoRequirement(String(req.params.id), direction);
    res.json({ items });
  }),
);
