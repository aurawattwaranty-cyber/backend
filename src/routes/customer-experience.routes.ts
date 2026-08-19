import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  getCustomerExperience,
  getPublicCustomerExperience,
  resetCustomerExperience,
  updateCustomerExperience,
} from "../services/customer-experience.service.js";

export const customerExperienceRouter = Router();

/** Public — the register wizard and status page render from this. */
customerExperienceRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ item: await getPublicCustomerExperience() });
  }),
);

/** Full config, hidden entries included, for the super admin editor. */
customerExperienceRouter.get(
  "/admin",
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ item: await getCustomerExperience() });
  }),
);

customerExperienceRouter.put(
  "/",
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const updated = await updateCustomerExperience(
      req.body ?? {},
      req.user?.name ?? "Super Admin",
    );
    res.json({ item: updated });
  }),
);

customerExperienceRouter.post(
  "/reset",
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const reset = await resetCustomerExperience(req.user?.name ?? "Super Admin");
    res.json({ item: reset });
  }),
);
