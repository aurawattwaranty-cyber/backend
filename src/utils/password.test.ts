import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, isHashedPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  test("accepts the password it hashed", async () => {
    const hash = await hashPassword("Correct-Horse-Battery");
    assert.equal(await verifyPassword("Correct-Horse-Battery", hash), true);
  });

  test("rejects a wrong password", async () => {
    const hash = await hashPassword("Correct-Horse-Battery");
    assert.equal(await verifyPassword("correct-horse-battery", hash), false);
    assert.equal(await verifyPassword("", hash), false);
    assert.equal(await verifyPassword("Correct-Horse-Batter", hash), false);
  });

  test("never stores the password in the digest", async () => {
    const hash = await hashPassword("plaintext-leak-check");
    assert.equal(hash.includes("plaintext-leak-check"), false);
  });

  test("salts every hash, so equal passwords differ on disk", async () => {
    const a = await hashPassword("same-password-twice");
    const b = await hashPassword("same-password-twice");
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same-password-twice", a), true);
    assert.equal(await verifyPassword("same-password-twice", b), true);
  });

  test("records the cost parameters alongside the digest", async () => {
    const hash = await hashPassword("parameters");
    const [scheme, N, r, p, salt, digest] = hash.split("$");
    assert.equal(scheme, "scrypt");
    assert.equal(N, "16384");
    assert.equal(r, "8");
    assert.equal(p, "1");
    assert.equal(salt?.length, 32);
    assert.equal(digest?.length, 128);
  });

  test("returns false rather than throwing on a malformed digest", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "scrypt$16384$8$1$deadbeef",
      "scrypt$abc$8$1$aa$bb",
      "bcrypt$16384$8$1$aa$bb",
      "scrypt$16384$8$1$$",
    ]) {
      assert.equal(await verifyPassword("anything", bad), false, `digest: ${bad}`);
    }
  });

  test("identifies its own hash format", async () => {
    assert.equal(isHashedPassword(await hashPassword("x")), true);
    assert.equal(isHashedPassword("aurawatt2024"), false);
  });
});
