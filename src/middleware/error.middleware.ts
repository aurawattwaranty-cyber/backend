import type { NextFunction, Request, Response } from "express";
import { isAppError, toMessage } from "../utils/errors.js";

export function notFound(
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.status(404).json({
    error: {
      message: "Route not found.",
      code: "not_found",
    },
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      message: toMessage(error),
      code: "internal_error",
    },
  });
}
