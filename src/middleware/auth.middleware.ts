import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { getUserFromJwt, verifyCsrfToken } from "../services/auth.service.js";
import { AppError } from "../utils/errors.js";

function extractBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function resolveJwt(req: Request): string | null {
  const cookieToken = req.cookies?.[config.cookieName];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return extractBearerToken(req.header("authorization") ?? undefined);
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = resolveJwt(req);
  if (token) {
    const user = getUserFromJwt(token);
    if (user) {
      req.jwtToken = token;
      req.user = user;
    }
  }
  next();
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = resolveJwt(req);
  if (!token) {
    next(new AppError("Please sign in to continue.", 401, "unauthorized"));
    return;
  }

  const user = getUserFromJwt(token);
  if (!user) {
    next(new AppError("Your sign-in has expired. Please sign in again.", 401, "session_expired"));
    return;
  }

  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    !verifyCsrfToken(token, req.header("x-csrf-token") ?? undefined)
  ) {
    next(new AppError("Your security token is missing or invalid. Refresh and try again.", 403, "csrf_invalid"));
    return;
  }

  req.jwtToken = token;
  req.user = user;
  next();
}


export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError("Please sign in to continue.", 401, "unauthorized"));
    return;
  }

  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    next(new AppError("You do not have permission to perform this action.", 403, "forbidden"));
    return;
  }

  next();
}

/**
 * Super admin only — owns the customer-experience configuration.
 *
 * Kept separate from `requireAdmin` on purpose: day-to-day admins run the
 * catalogue and stock, but changing what every customer sees on the public
 * pages is a narrower privilege.
 */
export function requireSuperAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError("Please sign in to continue.", 401, "unauthorized"));
    return;
  }

  if (req.user.role !== "superadmin") {
    next(
      new AppError(
        "Only a super admin can change what customers see.",
        403,
        "forbidden",
      ),
    );
    return;
  }

  next();
}

/**
 * Allows any signed-in staff account through.
 *
 * Verifiers review registrations and record decisions; admins also manage the
 * catalogue, serial stock and other accounts; super admins additionally own the
 * public-facing field configuration. Routes pick the guard that matches the
 * level of access they need.
 */
export function requireStaff(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError("Please sign in to continue.", 401, "unauthorized"));
    return;
  }

  if (
    req.user.role !== "superadmin" &&
    req.user.role !== "admin" &&
    req.user.role !== "verifier"
  ) {
    next(new AppError("You do not have permission to perform this action.", 403, "forbidden"));
    return;
  }

  next();
}
