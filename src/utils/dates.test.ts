import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { addMonths, calculateWarrantyPeriod, daysBetween, isExpired, toIsoDate } from "./dates.js";

describe("toIsoDate", () => {
  test("normalises a date to YYYY-MM-DD", () => {
    assert.equal(toIsoDate("2026-08-01"), "2026-08-01");
    assert.equal(toIsoDate(new Date(2026, 7, 1)), "2026-08-01");
  });

  test("returns an empty string for an unparseable value", () => {
    assert.equal(toIsoDate("not a date"), "");
  });
});

describe("addMonths", () => {
  test("adds whole months", () => {
    assert.equal(addMonths("2026-01-15", 1), "2026-02-15");
    assert.equal(addMonths("2026-01-15", 12), "2027-01-15");
  });

  test("clamps to the last day when the target month is shorter", () => {
    // The bug this guards against is 31 Jan + 1 month rolling into 3 March.
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2026-03-31", 1), "2026-04-30");
    assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
  });

  test("handles leap years", () => {
    assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
    assert.equal(addMonths("2028-02-29", 12), "2029-02-28");
  });

  test("crosses year boundaries", () => {
    assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
  });
});

describe("calculateWarrantyPeriod", () => {
  test("computes the standard 60 month term", () => {
    const period = calculateWarrantyPeriod("2026-08-01", 60);
    assert.deepEqual(period, {
      start: "2026-08-01",
      end: "2031-08-01",
      durationMonths: 60,
    });
  });

  test("computes the 84 month term used by HybridMax", () => {
    // Matches warranty #1029 as activated in production.
    const period = calculateWarrantyPeriod("2026-07-23", 84);
    assert.equal(period.start, "2026-07-23");
    assert.equal(period.end, "2033-07-23");
  });

  test("computes the 120 month term used by HybridUltra", () => {
    assert.equal(calculateWarrantyPeriod("2026-01-10", 120).end, "2036-01-10");
  });
});

describe("daysBetween", () => {
  test("counts forwards and backwards", () => {
    assert.equal(daysBetween("2026-08-01", "2026-08-11"), 10);
    assert.equal(daysBetween("2026-08-11", "2026-08-01"), -10);
    assert.equal(daysBetween("2026-08-01", "2026-08-01"), 0);
  });

  test("is unaffected by a DST transition", () => {
    assert.equal(daysBetween("2026-03-01", "2026-04-01"), 31);
  });
});

describe("isExpired", () => {
  const reference = new Date("2026-08-18T12:00:00");

  test("is false while the term is running", () => {
    assert.equal(isExpired("2033-07-23", reference), false);
  });

  test("is false on the final day", () => {
    assert.equal(isExpired("2026-08-18", reference), false);
  });

  test("is true the day after the term ends", () => {
    assert.equal(isExpired("2026-08-17", reference), true);
  });

  test("treats a missing end date as not expired", () => {
    assert.equal(isExpired("", reference), false);
  });
});
