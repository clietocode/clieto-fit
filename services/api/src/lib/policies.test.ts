import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, requireRoles } from "./api";
import {
  currentBillingMonth,
  billingMonthForTimeZone,
  isPaymentFullyPaid,
  localDateForTimeZone,
} from "./policies";

test("attendance dates use the gym timezone, including day boundaries", () => {
  const instant = new Date("2026-03-01T01:30:00.000Z");
  assert.equal(localDateForTimeZone(instant, "America/Los_Angeles"), "2026-02-28");
  assert.equal(localDateForTimeZone(instant, "Asia/Kolkata"), "2026-03-01");
});

test("only a fully covered PAID record counts as paid", () => {
  assert.equal(isPaymentFullyPaid("PAID", 5000, 5000), true);
  assert.equal(isPaymentFullyPaid("PAID", 4999, 5000), false);
  assert.equal(isPaymentFullyPaid("PARTIAL", 5000, 5000), false);
  assert.equal(isPaymentFullyPaid("OVERDUE", 5000, 5000), false);
  assert.equal(isPaymentFullyPaid("REFUNDED", 5000, 5000), false);
});

test("server role checks deny members from admin-only operations", () => {
  assert.throws(
    () => requireRoles({ role: "USER" }, ["ADMIN"]),
    (error: unknown) => error instanceof ApiError && error.status === 403,
  );
  assert.doesNotThrow(() => requireRoles({ role: "ADMIN" }, ["ADMIN", "SUPER_ADMIN"]));
});

test("billing periods use a stable YYYY-MM format", () => {
  assert.equal(currentBillingMonth(new Date("2026-01-31T23:59:00.000Z")), "2026-01");
  assert.equal(
    billingMonthForTimeZone(new Date("2026-03-01T02:00:00.000Z"), "America/Los_Angeles"),
    "2026-02",
  );
});
