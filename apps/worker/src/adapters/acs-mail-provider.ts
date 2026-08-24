import { EmailClient, type EmailMessage } from "@azure/communication-email";
import { ManagedIdentityCredential } from "@azure/identity";

import { MailProviderError, type MailMessage as ProviderMailMessage, type MailProvider } from "./mail-provider";

interface AcsMailConfig {
  senderAddress: string;
}

interface AcsEmailClient {
  beginSend(message: EmailMessage): Promise<{
    pollUntilDone(): Promise<{ status: string }>;
  }>;
}

interface AcsMailDependencies {
  client: AcsEmailClient;
}

export class AcsMailProvider implements MailProvider {
  constructor(private readonly config: AcsMailConfig, private readonly dependencies: AcsMailDependencies) {}

  async send(message: ProviderMailMessage): Promise<void> {
    const recipient = message.to.trim().toLowerCase();
    if (!recipient || !recipient.includes("@")) throw new MailProviderError("MAIL_INVALID_RECIPIENT", false);

    try {
      const poller = await this.dependencies.client.beginSend({
        senderAddress: this.config.senderAddress,
        recipients: { to: [{ address: recipient }] },
        content: {
          subject: message.subject,
          html: message.html,
          ...(message.text ? { plainText: message.text } : {}),
        },
      });
      const result = await poller.pollUntilDone();
      if (result.status !== "Succeeded") throw new MailProviderError("MAIL_UPSTREAM", true);
    } catch (error) {
      if (error instanceof MailProviderError) throw error;
      const statusCode = getStatusCode(error);
      if (statusCode === 401 || statusCode === 403) throw new MailProviderError("MAIL_AUTH", false);
      if (statusCode === 400) throw new MailProviderError("MAIL_INVALID_RECIPIENT", false);
      throw new MailProviderError("MAIL_UPSTREAM", true);
    }
  }
}

export function createAcsMailProvider(config: {
  endpoint: string;
  senderAddress: string;
  managedIdentityClientId: string;
}): AcsMailProvider {
  const credential = new ManagedIdentityCredential(config.managedIdentityClientId);
  return new AcsMailProvider(
    { senderAddress: config.senderAddress },
    { client: new EmailClient(config.endpoint, credential) },
  );
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}