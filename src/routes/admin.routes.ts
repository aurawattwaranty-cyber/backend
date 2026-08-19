import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { resetDatabase } from "../data/store.js";

export const adminRouter = Router();

adminRouter.post(
  "/reset-demo",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    resetDatabase();
    res.json({ ok: true });
  }),
);
