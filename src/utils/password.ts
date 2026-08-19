import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing for admin accounts.
 *
 * scrypt ships with Node, so this adds no dependency. Parameters are stored
 * alongside the digest, which lets the cost be raised later without
 * invalidating hashes that were written with the older settings.
 */

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Cost parameters. `N` must stay a power of two. */
const PARAMS = { N: 16_384, r: 8, p: 1 } as const;

/** scrypt needs its working memory ceiling raised to allow N=16384, r=8. */
const MAX_MEMORY = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEMORY,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * Verifies a password against a stored digest.
 *
 * Returns false rather than throwing on a malformed digest so a corrupt record
 * fails the login instead of returning a 500 that confirms the account exists.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4] ?? "";
  const digest = parts[5] ?? "";

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  if (!salt || !digest) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(digest, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  try {
    const derived = await scrypt(password, Buffer.from(salt, "hex"), expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored value is a hash this module wrote. */
export function isHashedPassword(value: string): boolean {
  return value.startsWith("scrypt$") && value.split("$").length === 6;
}
