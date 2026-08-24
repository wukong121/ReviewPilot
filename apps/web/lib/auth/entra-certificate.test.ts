import { generateKeyPairSync, randomUUID, X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decodeProtectedHeader, decodeJwt } from "jose";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createEntraCertificateFetch, createEntraClientAssertion } from "./entra-certificate";

const directory = mkdtempSync(join(tmpdir(), "reviewpilot-cert-"));
const privateKeyPath = join(directory, "private.pem");
const certificatePath = join(directory, "certificate.pem");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
execFileSync("openssl", [
  "req", "-new", "-x509", "-key", privateKeyPath, "-out", certificatePath,
  "-days", "1", "-subj", "/CN=ReviewPilot-test", "-sha256",
]);
const privateKeyPem = readFileSync(privateKeyPath, "utf8");
const certificatePem = readFileSync(certificatePath, "utf8");

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("Entra certificate authentication", () => {
  it("creates a PS256 assertion with the certificate SHA-256 thumbprint", async () => {
    const tokenEndpoint = "https://login.microsoftonline.com/tenant/oauth2/v2.0/token";
    const assertion = await createEntraClientAssertion({
      clientId: "11111111-1111-1111-1111-111111111111",
      tokenEndpoint,
      privateKeyPem,
      certificatePem,
      now: 1_700_000_000,
      jti: "22222222-2222-2222-2222-222222222222",
    });

    const header = decodeProtectedHeader(assertion);
    const claims = decodeJwt(assertion);
    const expectedThumbprint = new X509Certificate(certificatePem).fingerprint256
      .replaceAll(":", "").toLowerCase();

    expect(header).toMatchObject({ alg: "PS256", typ: "JWT" });
    expect(header["x5t#S256"]).toBe(
      Buffer.from(expectedThumbprint, "hex").toString("base64url"),
    );
    expect(claims).toMatchObject({
      aud: tokenEndpoint,
      iss: "11111111-1111-1111-1111-111111111111",
      sub: "11111111-1111-1111-1111-111111111111",
      jti: "22222222-2222-2222-2222-222222222222",
      iat: 1_700_000_000,
      nbf: 1_700_000_000,
      exp: 1_700_000_300,
    });
  });

  it("injects a certificate assertion only into the Entra token request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const certificateFetch = createEntraCertificateFetch({
      tenantId: "tenant-id",
      clientId: "client-id",
      privateKeyPem,
      certificatePem,
      fetcher,
    });
    const body = new URLSearchParams({ grant_type: "authorization_code", code: randomUUID() });

    await certificateFetch(
      "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token",
      { method: "POST", body },
    );

    const request = fetcher.mock.calls[0][1] as RequestInit;
    const sentBody = request.body as URLSearchParams;
    expect(sentBody.get("client_id")).toBe("client-id");
    expect(sentBody.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    expect(sentBody.get("client_assertion")?.split(".")).toHaveLength(3);
  });
});