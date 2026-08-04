export const GSTIN_RE =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const HSN_RE = /^[0-9]{4}([0-9]{2})?$/;

export function isValidGSTIN(value: string): boolean {
  return GSTIN_RE.test(value);
}

export function isValidPAN(value: string): boolean {
  return PAN_RE.test(value);
}

export function isValidIFSC(value: string): boolean {
  return IFSC_RE.test(value);
}

export function isValidHSN(value: string): boolean {
  return HSN_RE.test(value);
}
