export function normalizeCardUid(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\s:-]/g, "")
    .trim()
    .toUpperCase();
}
