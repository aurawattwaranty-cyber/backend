import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { deleteEvidencePhoto, uploadEvidencePhoto } from "../services/uploads.service.js";

export const uploadsRouter = Router();

uploadsRouter.post(
  "/photos",
  asyncHandler(async (req, res) => {
    const item = await uploadEvidencePhoto({
      requirementId: String(req.body?.requirementId ?? ""),
      requirementLabel: String(req.body?.requirementLabel ?? ""),
      fileName: String(req.body?.fileName ?? ""),
      dataUrl: String(req.body?.dataUrl ?? ""),
    });
    res.status(201).json({ item });
  }),
);

uploadsRouter.delete(
  "/photos/:storageId",
  asyncHandler(async (req, res) => {
    await deleteEvidencePhoto(String(req.params.storageId ?? ""));
    res.status(204).send();
  }),
);
