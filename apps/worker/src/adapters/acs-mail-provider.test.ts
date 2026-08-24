import { describe, expect, it, vi } from "vitest";

import { AcsMailProvider } from "./acs-mail-provider";
import { MailProviderError } from "./mail-provider";

function createClient(result: { status: string } = { status: "Succeeded" }) {
  const pollUntilDone = vi.fn().mockResolvedValue(result);
  const beginSend = vi.fn().mockResolvedValue({ pollUntilDone });
  return { beginSend, pollUntilDone };
}

describe("AcsMailProvider", () => {
  it("sends the normalized message from the configured ACS sender", async () => {
    const client = createClient();
    const provider = new AcsMailProvider(
      { senderAddress: "DoNotReply@example.azurecomm.net" },
      { client },
    );

    await provider.send({
      to: " Manager@Example.com ",
      subject: "待审批",
      html: "<h1>待审批</h1>",
      text: "待审批",
    });

    expect(client.beginSend).toHaveBeenCalledWith({
      senderAddress: "DoNotReply@example.azurecomm.net",
      recipients: { to: [{ address: "manager@example.com" }] },
      content: { subject: "待审批", html: "<h1>待审批</h1>", plainText: "待审批" },
    });
    expect(client.pollUntilDone).toHaveBeenCalledOnce();
  });

  it("rejects an invalid recipient before calling ACS", async () => {
    const client = createClient();
    const provider = new AcsMailProvider({ senderAddress: "DoNotReply@example.azurecomm.net" }, { client });

    await expect(provider.send({ to: "invalid", subject: "subject", html: "body" })).rejects.toMatchObject({
      code: "MAIL_INVALID_RECIPIENT",
      retryable: false,
    });
    expect(client.beginSend).not.toHaveBeenCalled();
  });

  it.each([401, 403])("classifies ACS status %s as a permanent authentication error", async (statusCode) => {
    const client = createClient();
    client.beginSend.mockRejectedValue({ statusCode });
    const provider = new AcsMailProvider({ senderAddress: "DoNotReply@example.azurecomm.net" }, { client });

    await expect(provider.send({ to: "user@example.com", subject: "subject", html: "body" })).rejects.toEqual(
      new MailProviderError("MAIL_AUTH", false),
    );
  });

  it.each([429, 500, 503])("classifies ACS status %s as a retryable upstream error", async (statusCode) => {
    const client = createClient();
    client.beginSend.mockRejectedValue({ statusCode });
    const provider = new AcsMailProvider({ senderAddress: "DoNotReply@example.azurecomm.net" }, { client });

    await expect(provider.send({ to: "user@example.com", subject: "subject", html: "body" })).rejects.toEqual(
      new MailProviderError("MAIL_UPSTREAM", true),
    );
  });

  it("treats a completed non-success response as an upstream failure", async () => {
    const client = createClient({ status: "Failed" });
    const provider = new AcsMailProvider({ senderAddress: "DoNotReply@example.azurecomm.net" }, { client });

    await expect(provider.send({ to: "user@example.com", subject: "subject", html: "body" })).rejects.toEqual(
      new MailProviderError("MAIL_UPSTREAM", true),
    );
  });
});