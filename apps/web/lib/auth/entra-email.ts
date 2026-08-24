import { z } from "zod";

export function normalizeEntraEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (z.string().email().safeParse(normalized).success) return normalized;

  const marker = normalized.indexOf("#ext#@");
  if (marker < 0) return null;
  const externalName = normalized.slice(0, marker);
  const separator = externalName.lastIndexOf("_");
  if (separator < 1) return null;
  const decoded = `${externalName.slice(0, separator)}@${externalName.slice(separator + 1)}`;
  return z.string().email().safeParse(decoded).success ? decoded : null;
}