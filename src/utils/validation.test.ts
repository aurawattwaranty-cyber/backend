import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isSerialFormatValid,
  normaliseSerial,
  requiredText,
  validateEmail,
  validateInstallationDate,
  validatePhone,
  validatePincode,
} from "./validation.js";

describe("requiredText", () => {
  test("trims strings and rejects everything else", () => {
    assert.equal(requiredText("  Meera Iyer "), "Meera Iyer");
    assert.equal(requiredText("   "), "");
    assert.equal(requiredText(undefined), "");
    assert.equal(requiredText(null), "");
    assert.equal(requiredText(42), "");
  });
});

describe("validateEmail", () => {
  test("accepts ordinary addresses", () => {
    for (const value of [
      "admin@aurawatt.in",
      "meera.iyer@example.co.uk",
      "  spaced@example.com  ",
    ]) {
      assert.equal(validateEmail(value), true, value);
    }
  });

  test("rejects malformed addresses", () => {
    for (const value of ["", "no-at-sign", "a@b", "a@b.c", "two @spaces.com"]) {
      assert.equal(validateEmail(value), false, value);
    }
  });
});

describe("validatePhone", () => {
  test("accepts 10 digit Indian mobile numbers", () => {
    assert.equal(validatePhone("9876543210"), true);
    assert.equal(validatePhone("6000000000"), true);
    assert.equal(validatePhone("98765 43210"), true);
    assert.equal(validatePhone("98765-43210"), true);
  });

  test("rejects numbers that cannot be Indian mobiles", () => {
    for (const value of ["5876543210", "987654321", "98765432100", "", "abcdefghij"]) {
      assert.equal(validatePhone(value), false, value);
    }
  });
});

describe("validatePincode", () => {
  test("accepts a 6 digit code not starting with zero", () => {
    assert.equal(validatePincode("411001"), true);
    assert.equal(validatePincode(" 560034 "), true);
  });

  test("rejects anything else", () => {
    for (const value of ["011001", "41100", "4110011", "", "4110A1"]) {
      assert.equal(validatePincode(value), false, value);
    }
  });
});

describe("serial numbers", () => {
  test("normalises case and strips whitespace", () => {
    assert.equal(normaliseSerial(" aw-hi-5kw-24101 "), "AW-HI-5KW-24101");
    assert.equal(normaliseSerial("aw hi 5kw"), "AWHI5KW");
  });

  test("accepts Aurawatt serial formats", () => {
    assert.equal(isSerialFormatValid("AW-HI-5KW-24101"), true);
    assert.equal(isSerialFormatValid("AW-BT-51-24101"), true);
    assert.equal(isSerialFormatValid("aw-hi-3kw-24001"), true);
  });

  test("rejects values that are too short or start with a separator", () => {
    for (const value of ["", "AW-1", "-AW-HI-5KW", `AW${"-9".repeat(40)}`]) {
      assert.equal(isSerialFormatValid(value), false, value);
    }
  });
});

describe("validateInstallationDate", () => {
  test("accepts today and past dates", () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;
    assert.equal(validateInstallationDate(iso), true);
    assert.equal(validateInstallationDate("2020-01-01"), true);
  });

  test("rejects empty and unparseable values", () => {
    assert.equal(validateInstallationDate(""), false);
    assert.equal(validateInstallationDate("31-12-2026"), false);
  });

  test("rejects a future installation date", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = `${future.getFullYear()}-${`${future.getMonth() + 1}`.padStart(2, "0")}-${`${future.getDate()}`.padStart(2, "0")}`;
    assert.equal(validateInstallationDate(iso), false);
  });
});
