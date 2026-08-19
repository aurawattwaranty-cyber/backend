import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { adminRouter } from "./admin.routes.js";
import { customerExperienceRouter } from "./customer-experience.routes.js";
import { healthRouter } from "./health.routes.js";
import { photoRequirementsRouter } from "./photo-requirements.routes.js";
import { productsRouter } from "./products.routes.js";
import { serialsRouter } from "./serials.routes.js";
import { uploadsRouter } from "./uploads.routes.js";
import { warrantiesRouter } from "./warranties.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/customer-experience", customerExperienceRouter);
apiRouter.use("/models", productsRouter);
apiRouter.use("/photo-requirements", photoRequirementsRouter);
apiRouter.use("/serials", serialsRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/warranties", warrantiesRouter);

apiRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "aurawatt-warranty-api",
    routes: [
      "/api/health",
      "/api/auth",
      "/api/customer-experience",
      "/api/models",
      "/api/photo-requirements",
      "/api/serials",
      "/api/uploads",
      "/api/warranties",
    ],
  });
});
