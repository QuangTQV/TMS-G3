// Validate ISO 6346 check digit bằng code thường — không tin thẳng kết quả AI/OCR
// (ràng buộc 3, CLAUDE.md; docs/ai-processing.md nhóm A #5).
// Format: 4 chữ cái (3 chủ sở hữu + 1 loại thiết bị) + 6 chữ số + 1 check digit.

const LETTER_VALUES: Record<string, number> = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38,
};

export function isValidContainerNumber(raw: string): boolean {
  const number = raw.trim().toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(number)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = number[i];
    const value = i < 4 ? LETTER_VALUES[char] : Number(char);
    sum += value * 2 ** i;
  }
  const expectedCheckDigit = (sum % 11) % 10;
  return expectedCheckDigit === Number(number[10]);
}
