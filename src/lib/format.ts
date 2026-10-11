export function formatMoney(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
  }).format(minorUnits / 100);
}

export function formatDateTime(value: Date | string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDate(value: Date | string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
