import { randomUUID, X509Certificate } from "node:crypto";

import { importPKCS8, SignJWT } from "jose";

const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

interface AssertionInput {
  clientId: string;
  tokenEndpoint: string;
  privateKeyPem: string;
  certificatePem: string;
  now?: number;
  jti?: string;
}

interface CertificateFetchInput {
  tenantId: string;
  clientId: string;
  privateKeyPem: string;
  certificatePem: string;
  fetcher?: typeof fetch;
}

function certificateSha256Thumbprint(certificatePem: string): string {
  const fingerprint = new X509Certificate(certificatePem).fingerprint256
    .replaceAll(":", "")
    .toLowerCase();
  return Buffer.from(fingerprint, "hex").toString("base64url");
}

export async function createEntraClientAssertion(input: AssertionInput): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  const privateKey = await importPKCS8(input.privateKeyPem, "PS256");

  return new SignJWT({})
    .setProtectedHeader({
      alg: "PS256",
      typ: "JWT",
      "x5t#S256": certificateSha256Thumbprint(input.certificatePem),
    })
    .setAudience(input.tokenEndpoint)
    .setIssuer(input.clientId)
    .setSubject(input.clientId)
    .setJti(input.jti ?? randomUUID())
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
}

export function createEntraCertificateFetch(input: CertificateFetchInput): typeof fetch {
  const fetcher = input.fetcher ?? fetch;
  const tokenEndpoint = `https://login.microsoftonline.com/${input.tenantId}/oauth2/v2.0/token`;

  return async (resource, init) => {
    const url = resource instanceof Request ? resource.url : resource.toString();
    if (url !== tokenEndpoint || init?.method?.toUpperCase() !== "POST") {
      return fetcher(resource, init);
    }

    const body = init.body instanceof URLSearchParams
      ? new URLSearchParams(init.body)
      : typeof init.body === "string"
        ? new URLSearchParams(init.body)
        : null;
    if (!body) {
      throw new Error("Entra token request body must be URL encoded");
    }

    body.set("client_id", input.clientId);
    body.set("client_assertion_type", CLIENT_ASSERTION_TYPE);
    body.set("client_assertion", await createEntraClientAssertion({
      clientId: input.clientId,
      tokenEndpoint,
      privateKeyPem: input.privateKeyPem,
      certificatePem: input.certificatePem,
    }));

    return fetcher(resource, { ...init, body });
  };
}