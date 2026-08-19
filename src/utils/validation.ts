const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;
const PINCODE_PATTERN = /^[1-9]\d{5}$/;
const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9-]{5,31}$/;

export function requiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function validatePhone(value: string): boolean {
  return INDIAN_MOBILE_PATTERN.test(value.replace(/[\s-]/g, ""));
}

export function validatePincode(value: string): boolean {
  return PINCODE_PATTERN.test(value.trim());
}

export function normaliseSerial(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isSerialFormatValid(value: string): boolean {
  return SERIAL_PATTERN.test(normaliseSerial(value));
}

export function validateInstallationDate(value: string): boolean {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;
  return value <= todayIso && value >= "2010-01-01";
}
