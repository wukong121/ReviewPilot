export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export class MailProviderError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = "MailProviderError";
  }
}