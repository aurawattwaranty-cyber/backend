import crypto from "node:crypto";
import { config } from "../config.js";
import { getMongoDb } from "../data/mongo.js";
import { clone, createId, getDatabase, isMongoStoreActive, mutate } from "../data/store.js";
import type {
  AdminAccount,
  AdminRole,
  AdminUser,
  AuthenticatedSession,
  ChangePasswordInput,
  CreateUserInput,
  LoginInput,
} from "../types.js";
import { AppError } from "../utils/errors.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { validateEmail } from "../utils/validation.js";

interface StoredSessionDocument extends AuthenticatedSession {
  _id: string;
}

const sessions = new Map<string, AuthenticatedSession>();

/**
 * Hash of a throwaway secret, used to spend the same work on a login for an
 * address that has no account as one that does.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(16).toString("hex"));
  return dummyHashPromise;
}
let sessionsInitialized = false;
let useMongoSessions = false;
let sessionPersistQueue = Promise.resolve();

function createToken(): string {
  return crypto.randomUUID();
}

/** Strips the password hash so it can never reach a response body. */
function toAdminUser(account: AdminAccount): AdminUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
  };
}

function findAccountByEmail(email: string): AdminAccount | undefined {
  const needle = email.trim().toLowerCase();
  return getDatabase().users.find(
    (account) => account.email.toLowerCase() === needle,
  );
}

/**
 * Creates the first admin account when the database has none.
 *
 * Covers both a fresh seed and a v1 database migrated forward. The bootstrap
 * password comes from `ADMIN_PASSWORD`; when that is unset a random one is
 * generated and printed once, so an unconfigured deployment is never left with
 * a guessable default.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  if (getDatabase().users.length > 0) return;

  const generated = !config.bootstrapAdminPassword.trim();
  const password = generated
    ? crypto.randomBytes(12).toString("base64url")
    : config.bootstrapAdminPassword;

  const account: AdminAccount = {
    id: createId("usr"),
    name: config.bootstrapAdminName,
    email: config.bootstrapAdminEmail.trim().toLowerCase(),
    role: "admin",
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
    console.log(`Bootstrap admin account created for ${account.email}.`);
  }
}

function sessionExpired(session: AuthenticatedSession): boolean {
  return new Date(session.expiresAt).getTime() < Date.now();
}

async function getSessionCollection() {
  const db = await getMongoDb();
  return db.collection<StoredSessionDocument>("auth_sessions");
}

async function persistSession(session: AuthenticatedSession): Promise<void> {
  if (!useMongoSessions) return;
  const snapshot = clone(session);
  sessionPersistQueue = sessionPersistQueue
    .then(async () => {
      const collection = await getSessionCollection();
      await collection.updateOne(
        { _id: snapshot.token },
        { $set: snapshot },
        { upsert: true },
      );
    })
    .catch((error: unknown) => {
      console.error("Failed to persist auth session:", error);
    });
  await sessionPersistQueue;
}

async function removeSession(token: string): Promise<void> {
  if (!useMongoSessions) return;
  sessionPersistQueue = sessionPersistQueue
    .then(async () => {
      const collection = await getSessionCollection();
      await collection.deleteOne({ _id: token });
    })
    .catch((error: unknown) => {
      console.error("Failed to delete auth session:", error);
    });
  await sessionPersistQueue;
}

export async function initializeAuthSessions(): Promise<void> {
  useMongoSessions = isMongoStoreActive();
  sessions.clear();
  sessionsInitialized = true;

  if (!useMongoSessions) return;

  const collection = await getSessionCollection();
  const now = new Date().toISOString();
  await collection.deleteMany({ expiresAt: { $lt: now } });
  const activeSessions = await collection.find().toArray();
  activeSessions.forEach((document) => {
    if (!sessionExpired(document)) {
      sessions.set(document.token, {
        token: document.token,
        user: document.user,
        expiresAt: document.expiresAt,
      });
    }
  });
}

export function getSessionByToken(token: string): AuthenticatedSession | null {
  if (!sessionsInitialized) return null;

  const session = sessions.get(token);
  if (!session) return null;
  if (sessionExpired(session)) {
    sessions.delete(token);
    void removeSession(token);
    return null;
  }
  return session;
}

export async function login(
  input: LoginInput,
): Promise<AuthenticatedSession> {
  const email = input.email.trim().toLowerCase();
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
  const matches = account
    ? await verifyPassword(input.password, account.passwordHash)
    : await verifyPassword(input.password, await getDummyHash());

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

  const user = toAdminUser(account);
  const token = createToken();
  const expiresAt = new Date(
    Date.now() + (input.remember ? 30 : 1) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const session: AuthenticatedSession = { token, user, expiresAt };
  sessions.set(token, session);
  void persistSession(session);
  return session;
}

export function logout(token?: string | null): void {
  if (!token) return;
  sessions.delete(token);
  void removeSession(token);
}

export function sessionCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: (remember ? 30 : 1) * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export function clearCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
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
  const role: AdminRole = input.role === "verifier" ? "verifier" : "admin";

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
    active: true,
    createdAt: new Date().toISOString(),
  };

  mutate((db) => db.users.push(account));
  return toAdminUser(account);
}

export function setUserActive(userId: string, active: boolean): AdminUser {
  const db = getDatabase();
  const account = db.users.find((entry) => entry.id === userId);
  if (!account) {
    throw new AppError("That account no longer exists.", 404, "not_found");
  }

  // Refuse to strand the system without a way back in.
  if (!active && account.role === "admin") {
    const otherActiveAdmins = db.users.filter(
      (entry) => entry.id !== userId && entry.role === "admin" && entry.active,
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
    if (stored) stored.active = active;
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
    if (stored) stored.passwordHash = passwordHash;
  });

  // Every other session for this user is invalidated, the current one included.
  [...sessions.values()]
    .filter((session) => session.user.id === userId)
    .forEach((session) => {
      sessions.delete(session.token);
      void removeSession(session.token);
    });
}
