function csv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const corsOrigins = unique([
  ...csv(process.env.CORS_ORIGIN, []),
  ...csv(process.env.SITE_URL, []),
]);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: corsOrigins.length > 0 ? corsOrigins : ["http://localhost:3000"],
  dataDir: process.env.DATA_DIR ?? "./data",
  siteUrl: process.env.SITE_URL ?? "http://localhost:3000",
  mongoUri: process.env.MONGODB_URI ?? "",
  databaseName: process.env.DATABASE_NAME ?? "aurawatt",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER ?? "aurawatt",
  cookieName: process.env.COOKIE_NAME ?? "aw_access",
  // A random development fallback keeps local setup friction-free. Production
  // deliberately has no fallback: token signatures must survive restarts and
  // be controlled by deployment secret management.
  jwtSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production"
      ? ""
      : crypto.randomBytes(48).toString("base64url")),
  // Seven days avoids unnecessary sign-ins for normal admin work; “remember
  // me” remains deliberately longer but can be tuned per deployment.
  jwtAccessTtlDays: positiveInteger(process.env.JWT_ACCESS_TTL_DAYS, 7),
  jwtRememberTtlDays: positiveInteger(process.env.JWT_REMEMBER_TTL_DAYS, 30),
  // Used once, to create the first admin account when the database has none.
  // Leaving ADMIN_PASSWORD unset generates a random one and prints it on boot.
  bootstrapAdminEmail: process.env.ADMIN_EMAIL ?? "admin@aurawatt.in",
  bootstrapAdminPassword: process.env.ADMIN_PASSWORD ?? "",
  bootstrapAdminName: process.env.ADMIN_NAME ?? "Aurawatt Admin",
  // Destructive test-only operation. It must be explicitly enabled.
  allowDataReset: process.env.ALLOW_DATA_RESET === "true",
};

export const isProduction = process.env.NODE_ENV === "production";
import crypto from "node:crypto";
