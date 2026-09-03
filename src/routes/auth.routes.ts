import { Router } from "express";
import { config } from "../config.js";
import {
  changePassword,
  clearCookieOptions,
  createUser,
  listUsers,
  login,
  logout,
  sessionCookieOptions,
  setUserActive,
} from "../services/auth.service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { optionalAuth, requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password, remember = false } = req.body ?? {};
    const session = await login({
      email: String(email ?? ""),
      password: String(password ?? ""),
      remember: Boolean(remember),
    });

    res.cookie(config.cookieName, session.token, sessionCookieOptions(Boolean(remember)));
    res.json({
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  }),
);

// Public request flow: the account is created inactive and cannot log in
// until an existing admin authorizes it from the account management screen.
authRouter.post(
  "/access-requests",
  asyncHandler(async (req, res) => {
    const created = await createUser({
      name: String(req.body?.name ?? ""),
      email: String(req.body?.email ?? ""),
      password: String(req.body?.password ?? ""),
      role: "admin",
    });
    res.status(201).json({ item: created });
  }),
);

authRouter.get(
  "/session",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user ?? null });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    logout(req.sessionToken);
    res.clearCookie(config.cookieName, clearCookieOptions());
    res.json({ ok: true });
  }),
);

authRouter.get("/me", requireAuth, (_req, res) => {
  res.json({ user: _req.user });
});

authRouter.post(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    await changePassword(req.user!.id, {
      currentPassword: String(req.body?.currentPassword ?? ""),
      newPassword: String(req.body?.newPassword ?? ""),
    });
    res.clearCookie(config.cookieName, clearCookieOptions());
    res.json({ ok: true });
  }),
);

/* Account administration — admin role only. */

authRouter.get(
  "/users",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ items: listUsers() });
  }),
);

authRouter.post(
  "/users",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const created = await createUser(req.body ?? {});
    res.status(201).json({ item: created });
  }),
);

authRouter.patch(
  "/users/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = setUserActive(
      String(req.params.id),
      Boolean(req.body?.active),
      req.user!.id,
    );
    res.json({ item: updated });
  }),
);
