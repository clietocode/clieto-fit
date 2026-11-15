export function localDateForTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isPaymentFullyPaid(
  status: string,
  amountCents: number,
  expectedCents: number,
): boolean {
  return status === "PAID" && amountCents >= expectedCents;
}

export function currentBillingMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function billingMonthForTimeZone(date: Date, timeZone: string): string {
  return localDateForTimeZone(date, timeZone).slice(0, 7);
}
