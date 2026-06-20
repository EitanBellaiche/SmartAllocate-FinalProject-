export const VALID_TARGET_TYPES = ["resource", "booking", "pair", "multi"];

export function isValidTargetType(value) {
  return VALID_TARGET_TYPES.includes(value);
}
