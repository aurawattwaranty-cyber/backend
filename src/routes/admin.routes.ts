import { Router } from "express";
import { config } from "../config.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { AppError } from "../utils/errors.js";
import { resetDatabase } from "../data/store.js";

export const adminRouter = Router();

adminRouter.post(
  "/reset",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    if (!config.allowDataReset) {
      throw new AppError(
        "Data reset is disabled to protect warranty records.",
        403,
        "reset_disabled",
      );
    }
    resetDatabase();
    res.json({ ok: true });
  }),
);
