import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { getSessionByToken } from "../services/auth.service.js";
import { AppError } from "../utils/errors.js";

function extractBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function resolveSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[config.cookieName];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }

  const headerToken =
    typeof req.header("x-session-token") === "string"
      ? req.header("x-session-token")?.trim()
      : null;
  if (headerToken) return headerToken;

  return extractBearerToken(req.header("authorization") ?? undefined);
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = resolveSessionToken(req);
  if (token) {
    req.sessionToken = token;
    const session = getSessionByToken(token);
    if (session) {
      req.user = session.user;
    }
  }
  next();
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = resolveSessionToken(req);
  if (!token) {
    next(new AppError("Please sign in to continue.", 401, "unauthorized"));
    return;
  }

  const session = getSessionByToken(token);
  if (!session) {
    next(new AppError("Your session has expired. Please sign in again.", 401, "session_expired"));
    return;
  }

  req.sessionToken = token;
  req.user = session.user;
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

  if (req.user.role !== "admin") {
    next(new AppError("You do not have permission to perform this action.", 403, "forbidden"));
    return;
  }

  next();
}

/**
 * Allows any signed-in staff account through.
 *
 * Verifiers review registrations and record decisions; only admins manage the
 * catalogue, serial stock and other accounts. Routes pick the guard that
 * matches the level of access they need.
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

  if (req.user.role !== "admin" && req.user.role !== "verifier") {
    next(new AppError("You do not have permission to perform this action.", 403, "forbidden"));
    return;
  }

  next();
}
