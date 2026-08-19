import { Router } from "express";
import { config } from "../config.js";
import { requireAuth, requireStaff } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getWarrantyCertificatePdf } from "../services/certificate.service.js";
import type { WarrantyQuery } from "../types.js";
import {
  approveWarranty,
  createWarrantyRegistration,
  getDashboardStats,
  getRecentRegistrations,
  getWarrantyById,
  getWarrantyRegistrations,
  getWarrantyStatus,
  rejectWarranty,
  requestCorrection,
  resubmitWarranty,
} from "../services/warranties.service.js";

export const warrantiesRouter = Router();

warrantiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const created = await createWarrantyRegistration(req.body ?? {});
    res.status(201).json({ item: created });
  }),
);

warrantiesRouter.get(
  "/dashboard/stats",
  requireAuth,
  requireStaff,
  asyncHandler(async (_req, res) => {
    res.json(await getDashboardStats());
  }),
);

warrantiesRouter.get(
  "/recent",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 5);
    res.json({ items: await getRecentRegistrations(Number.isFinite(limit) ? limit : 5) });
  }),
);

warrantiesRouter.get(
  "/",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 10);
    const query: WarrantyQuery = {
      search: String(req.query.search ?? ""),
      status:
        req.query.status === "pending" ||
        req.query.status === "correction" ||
        req.query.status === "active" ||
        req.query.status === "rejected" ||
        req.query.status === "expired"
          ? req.query.status
          : "all",
      modelId: typeof req.query.modelId === "string" ? req.query.modelId : "all",
      sortBy:
        req.query.sortBy === "id" ||
        req.query.sortBy === "customer" ||
        req.query.sortBy === "submittedAt"
          ? req.query.sortBy
          : "submittedAt",
      sortDir: req.query.sortDir === "asc" ? "asc" : "desc",
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 10,
    };
    if (typeof req.query.from === "string") {
      query.from = req.query.from;
    }
    if (typeof req.query.to === "string") {
      query.to = req.query.to;
    }
    const data = await getWarrantyRegistrations(query);
    res.json(data);
  }),
);

warrantiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ item: await getWarrantyById(String(req.params.id)) });
  }),
);

warrantiesRouter.get(
  "/:id/status",
  asyncHandler(async (req, res) => {
    res.json({ item: await getWarrantyStatus(String(req.params.id)) });
  }),
);

warrantiesRouter.get(
  "/:id/certificate",
  asyncHandler(async (req, res) => {
    const origin =
      req.get("origin") ||
      (req.get("host") ? `${req.protocol}://${req.get("host")}` : config.siteUrl);
    const pdf = await getWarrantyCertificatePdf(String(req.params.id), origin);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="aurawatt-warranty-${String(req.params.id)}.pdf"`,
    );
    res.send(pdf);
  }),
);

warrantiesRouter.post(
  "/:id/resubmit",
  asyncHandler(async (req, res) => {
    const updated = await resubmitWarranty(String(req.params.id), String(req.body?.note ?? ""));
    res.json({ item: updated });
  }),
);

warrantiesRouter.post(
  "/:id/approve",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const updated = await approveWarranty(String(req.params.id), req.body ?? {});
    res.json({ item: updated });
  }),
);

warrantiesRouter.post(
  "/:id/correction",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const updated = await requestCorrection(String(req.params.id), req.body ?? {});
    res.json({ item: updated });
  }),
);

warrantiesRouter.post(
  "/:id/reject",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const updated = await rejectWarranty(
      String(req.params.id),
      String(req.body?.reason ?? ""),
    );
    res.json({ item: updated });
  }),
);
