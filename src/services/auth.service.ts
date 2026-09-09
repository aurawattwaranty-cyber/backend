import crypto from "node:crypto";
import { config } from "../config.js";
import { createId, getDatabase, mutate } from "../data/store.js";
import type {
  AdminAccount,
  AdminRole,
  AdminUser,
  ChangePasswordInput,
  CreateUserInput,
  LoginInput,
} from "../types.js";
import { AppError } from "../utils/errors.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { validateEmail } from "../utils/validation.js";

interface JwtPayload {
  aud: "aurawatt-admin";
  exp: number;
  iat: number;
  iss: "aurawatt-api";
  role: AdminRole;
  sub: string;
  ver: number;
}

export interface AuthenticatedJwt {
  token: string;
  user: AdminUser;
  expiresAt: string;
}

/**
 * Hash of a throwaway secret, used to spend the same work on a login for an
 * address that has no account as one that does.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(16).toString("hex"));
  return dummyHashPromise;
}
function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", config.jwtSecret)
    .update(value)
    .digest("base64url");
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function accountAuthVersion(account: AdminAccount): number {
  return account.authVersion ?? 0;
}

function issueJwt(account: AdminAccount, remember: boolean): AuthenticatedJwt {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds =
    (remember ? config.jwtRememberTtlDays : config.jwtAccessTtlDays) *
    24 *
    60 *
    60;
  const payload: JwtPayload = {
    aud: "aurawatt-admin",
    exp: now + ttlSeconds,
    iat: now,
    iss: "aurawatt-api",
    role: account.role,
    sub: account.id,
    ver: accountAuthVersion(account),
  };
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const token = `${header}.${body}.${sign(`${header}.${body}`)}`;
  return {
    token,
    user: toAdminUser(account),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

/** Strips the password hash so it can never reach a response body. */
function toAdminUser(account: AdminAccount): AdminUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    active: account.active,
    createdAt: account.createdAt,
  };
}

function findAccountByEmail(email: string): AdminAccount | undefined {
  const needle = email.trim().toLowerCase();
  return getDatabase().users.find(
    (account) => account.email.toLowerCase() === needle,
  );
}

/**
 * Creates the first account when the database has none, as a super admin.
 *
 * Covers both a fresh seed and a pre-existing database. When `ADMIN_PASSWORD`
 * is set, that credential becomes the source of truth for the bootstrap email
 * so deployments stay easy to recover even after migrations or reseeds.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const bootstrapEmail = config.bootstrapAdminEmail.trim().toLowerCase();
  const hasConfiguredPassword = Boolean(config.bootstrapAdminPassword.trim());
  const existing = findAccountByEmail(bootstrapEmail);

  if (existing) {
    if (!hasConfiguredPassword) {
      ensureSuperAdminExists();
      return;
    }

    const passwordHash = await hashPassword(config.bootstrapAdminPassword);
    mutate((db) => {
      const stored = db.users.find((entry) => entry.id === existing.id);
      if (!stored) return;
      stored.name = config.bootstrapAdminName;
      stored.email = bootstrapEmail;
      stored.role = "superadmin";
      stored.passwordHash = passwordHash;
      stored.active = true;
    });
    console.log(`Bootstrap super admin account synced for ${bootstrapEmail}.`);
    return;
  }

  if (getDatabase().users.length > 0 && !hasConfiguredPassword) {
    ensureSuperAdminExists();
    return;
  }

  const generated = !hasConfiguredPassword;
  const password = generated
    ? crypto.randomBytes(12).toString("base64url")
    : config.bootstrapAdminPassword;

  const account: AdminAccount = {
    id: createId("usr"),
    name: config.bootstrapAdminName,
    email: bootstrapEmail,
    role: "superadmin",
    passwordHash: await hashPassword(password),
    active: true,
    createdAt: new Date().toISOString(),
  };

  mutate((db) => db.users.push(account));

  if (generated) {
    console.warn(
      [
        "",
        "  No ADMIN_PASSWORD was set. A bootstrap admin has been created:",
        `    email:    ${account.email}`,
        `    password: ${password}`,
        "  This password is shown once. Set ADMIN_PASSWORD in backend/.env to control it.",
        "",
      ].join("\n"),
    );
  } else {
    console.log(`Bootstrap super admin account created for ${account.email}.`);
  }
}

/**
 * Promotes the longest-standing active admin when a database predates the
 * super-admin role, so the customer-experience screens are never unreachable.
 */
function ensureSuperAdminExists(): void {
  const db = getDatabase();
  if (db.users.some((account) => account.role === "superadmin")) return;

  const candidate = db.users
    .filter((account) => account.active && account.role === "admin")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!candidate) return;

  mutate((store) => {
    const stored = store.users.find((entry) => entry.id === candidate.id);
    if (stored) stored.role = "superadmin";
  });

  console.log(
    `Promoted ${candidate.email} to super admin (no super admin existed).`,
  );
}

/** Refuse an unsafe deployment before it can issue a production credential. */
export function assertJwtConfiguration(): void {
  if (process.env.NODE_ENV === "production" && config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
  }
}

/**
 * Verifies signature and registered claims, then reloads the account so role
 * and activation changes take effect immediately. `authVersion` revokes all
 * previously issued tokens after a password or access change.
 */
export function getUserFromJwt(token: string): AdminUser | null {
  const [encodedHeader, encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature || extra.length > 0) return null;
  if (!timingSafeEqual(sign(`${encodedHeader}.${encodedPayload}`), signature)) return null;

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<JwtPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      header.alg !== "HS256" ||
      header.typ !== "JWT" ||
      payload.iss !== "aurawatt-api" ||
      payload.aud !== "aurawatt-admin" ||
      typeof payload.sub !== "string"
    ) {
      return null;
    }

    const { exp, iat, sub, ver } = payload;
    if (
      typeof exp !== "number" ||
      !Number.isInteger(exp) ||
      typeof iat !== "number" ||
      !Number.isInteger(iat) ||
      typeof ver !== "number" ||
      !Number.isInteger(ver) ||
      typeof sub !== "string" ||
      exp <= now ||
      iat > now + 60
    ) {
      return null;
    }

    const account = getDatabase().users.find((entry) => entry.id === sub);
    if (!account || !account.active || accountAuthVersion(account) !== ver) return null;
    return toAdminUser(account);
  } catch {
    return null;
  }
}

/** A per-JWT CSRF proof. The JWT stays HttpOnly; this derived value is safe for JS to hold. */
export function createCsrfToken(jwt: string): string {
  return crypto.createHmac("sha256", config.jwtSecret).update(`csrf:${jwt}`).digest("base64url");
}

export function verifyCsrfToken(jwt: string, csrfToken: string | undefined): boolean {
  return typeof csrfToken === "string" && timingSafeEqual(createCsrfToken(jwt), csrfToken);
}

export async function login(
  input: LoginInput,
): Promise<AuthenticatedJwt> {
  const email = input.email.trim().toLowerCase();
  const bootstrapEmail = config.bootstrapAdminEmail.trim().toLowerCase();
  const bootstrapPassword = config.bootstrapAdminPassword.trim();
  if (!email || !input.password) {
    throw new AppError(
      "Enter your email address and password.",
      400,
      "missing_credentials",
    );
  }

  const account = findAccountByEmail(email);

  // Verify against a throwaway hash when the account is missing so that a
  // wrong email and a wrong password take the same time to answer.
  let matches = account
    ? await verifyPassword(input.password, account.passwordHash)
    : await verifyPassword(input.password, await getDummyHash());

  if (
    !matches &&
    email === bootstrapEmail &&
    bootstrapPassword &&
    input.password === bootstrapPassword
  ) {
    if (account) {
      const passwordHash = await hashPassword(bootstrapPassword);
      mutate((db) => {
        const stored = db.users.find((entry) => entry.id === account.id);
        if (!stored) return;
        stored.name = config.bootstrapAdminName;
        stored.email = bootstrapEmail;
        stored.role = "superadmin";
        stored.passwordHash = passwordHash;
        stored.active = true;
      });
    } else {
      const passwordHash = await hashPassword(bootstrapPassword);
      const bootstrapAccount: AdminAccount = {
        id: createId("usr"),
        name: config.bootstrapAdminName,
        email: bootstrapEmail,
        role: "superadmin",
        passwordHash,
        active: true,
        createdAt: new Date().toISOString(),
      };
      mutate((db) => db.users.push(bootstrapAccount));
    }
    matches = true;
  }

  if (!account || !matches) {
    throw new AppError(
      "That email and password combination doesn't match an Aurawatt admin account.",
      401,
      "invalid_credentials",
    );
  }

  if (!account.active) {
    throw new AppError(
      "This account has been deactivated. Contact an administrator.",
      403,
      "account_disabled",
    );
  }

  mutate((db) => {
    const stored = db.users.find((entry) => entry.id === account.id);
    if (stored) stored.lastLoginAt = new Date().toISOString();
  });

  return issueJwt({ ...account, lastLoginAt: new Date().toISOString() }, input.remember);
}

export function sessionCookieOptions(remember: boolean) {
  const crossSiteCookie = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: crossSiteCookie ? "none" as const : "lax" as const,
    secure: crossSiteCookie,
    maxAge:
      (remember ? config.jwtRememberTtlDays : config.jwtAccessTtlDays) *
      24 *
      60 *
      60 *
      1000,
    path: "/",
  };
}

export function clearCookieOptions() {
  const crossSiteCookie = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: crossSiteCookie ? "none" as const : "lax" as const,
    secure: crossSiteCookie,
    path: "/",
  };
}

/* ------------------------------------------------------------------ *
 * Admin account management (admin role only — guarded at the route)
 * ------------------------------------------------------------------ */

export function listUsers(): AdminUser[] {
  return getDatabase().users.map(toAdminUser);
}

function assertPasswordStrength(password: string): void {
  if (password.trim().length < 10) {
    throw new AppError(
      "Choose a password of at least 10 characters.",
      400,
      "weak_password",
    );
  }
}

export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const role: AdminRole = "admin";

  if (!name) {
    throw new AppError("Enter a name for this account.", 400, "invalid_input");
  }
  if (!validateEmail(email)) {
    throw new AppError("Enter a valid email address.", 400, "invalid_input");
  }
  if (findAccountByEmail(email)) {
    throw new AppError(
      "An account with that email address already exists.",
      409,
      "email_taken",
    );
  }
  assertPasswordStrength(String(input.password ?? ""));

  const account: AdminAccount = {
    id: createId("usr"),
    name,
    email,
    role,
    passwordHash: await hashPassword(input.password),
    // New accounts must be explicitly authorized by an existing admin.
    active: false,
    createdAt: new Date().toISOString(),
  };

  mutate((db) => db.users.push(account));
  return toAdminUser(account);
}

export function setUserActive(
  userId: string,
  active: boolean,
  actorId?: string,
): AdminUser {
  const db = getDatabase();
  const account = db.users.find((entry) => entry.id === userId);
  if (!account) {
    throw new AppError("That account no longer exists.", 404, "not_found");
  }
  if (actorId && account.id === actorId && !active) {
    throw new AppError("You cannot deactivate your own account.", 400, "self_deactivation");
  }

  // Refuse to strand the system without a way back in.
  if (!active && (account.role === "admin" || account.role === "superadmin")) {
    const otherActiveAdmins = db.users.filter(
      (entry) =>
        entry.id !== userId &&
        (entry.role === "admin" || entry.role === "superadmin") &&
        entry.active,
    ).length;
    if (otherActiveAdmins === 0) {
      throw new AppError(
        "This is the only active admin account. Promote another admin first.",
        400,
        "last_admin",
      );
    }
  }

  mutate((store) => {
    const stored = store.users.find((entry) => entry.id === userId);
    if (stored) {
      stored.active = active;
      // Deactivation must take effect for already-issued JWTs too.
      stored.authVersion = accountAuthVersion(stored) + 1;
    }
  });

  return toAdminUser({ ...account, active });
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const account = getDatabase().users.find((entry) => entry.id === userId);
  if (!account) {
    throw new AppError("That account no longer exists.", 404, "not_found");
  }

  const ok = await verifyPassword(
    String(input.currentPassword ?? ""),
    account.passwordHash,
  );
  if (!ok) {
    throw new AppError(
      "Your current password is incorrect.",
      401,
      "invalid_credentials",
    );
  }

  assertPasswordStrength(String(input.newPassword ?? ""));
  const passwordHash = await hashPassword(input.newPassword);

  mutate((db) => {
    const stored = db.users.find((entry) => entry.id === userId);
    if (stored) {
      stored.passwordHash = passwordHash;
      stored.authVersion = accountAuthVersion(stored) + 1;
    }
  });
}
