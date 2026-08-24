import { z } from "zod";

const HttpsUrlSchema = z.string().url().refine((value) => value.startsWith("https://"), "must use HTTPS");
const SharedSchema = z.object({
  DATABASE_URL: z.string().url(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().min(1).optional(),
});

export const WebEnvSchema = SharedSchema.extend({
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  ENTRA_TENANT_ID: z.string().uuid(),
  ENTRA_CLIENT_ID: z.string().uuid(),
  ENTRA_CLIENT_SECRET: z.string().min(1).optional(),
  ENTRA_CLIENT_CERTIFICATE_BASE64: z.string().min(1).optional(),
  ENTRA_CLIENT_PRIVATE_KEY_BASE64: z.string().min(1).optional(),
  BOOTSTRAP_ADMIN_OBJECT_IDS: z.string().optional(),
}).refine(
  (value) => Boolean(value.ENTRA_CLIENT_SECRET) || Boolean(value.ENTRA_CLIENT_CERTIFICATE_BASE64 && value.ENTRA_CLIENT_PRIVATE_KEY_BASE64),
  "configure an Entra client secret or certificate credential",
);

export const WorkerEnvSchema = SharedSchema.extend({
  APIM_BASE_URL: HttpsUrlSchema,
  APIM_API_KEY: z.string().min(1),
  APIM_DEPLOYMENT: z.string().min(1),
  MANAGED_IDENTITY_CLIENT_ID: z.string().uuid().optional(),
  GRAPH_TENANT_ID: z.string().uuid().optional(),
  GRAPH_CLIENT_ID: z.string().uuid().optional(),
  GRAPH_CLIENT_SECRET: z.string().min(1).optional(),
  GRAPH_SHARED_MAILBOX: z.string().email(),
  PUBLIC_BASE_URL: HttpsUrlSchema,
}).refine(
  (value) => Boolean(value.MANAGED_IDENTITY_CLIENT_ID) || Boolean(value.GRAPH_TENANT_ID && value.GRAPH_CLIENT_ID && value.GRAPH_CLIENT_SECRET),
  "configure a managed identity or Graph client credentials",
);

const SENSITIVE_KEY = /(?:api[-_]?key|secret|password|token|authorization|cookie|prompt|summary|answer|body)/i;

export function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  }
  return value;
}
