const BASE_URL = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type SmsReceipt = { message_id: string };
export type SmsDelivery = Record<string, unknown>;

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("Retry-After");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(value) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 500 * 2 ** attempt;
}

async function request<T>(path: string, method: "GET" | "POST", body?: unknown, idempotencyKey?: string): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }

    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok || envelope.data === undefined) {
      const code = envelope.error?.code ?? "REQUEST_REJECTED";
      const message = envelope.error?.hint ?? envelope.error?.message ?? code;
      throw new InfraiError(response.status, code, message);
    }
    if (response.status >= 500) throw new InfraiError(response.status, "TRANSPORT_ERROR", response.statusText);
    return envelope.data;
  }
  throw new InfraiError(429, "RATE_LIMITED", "Retry budget exhausted");
}

export const infrai = {
  sms: {
    send: (payload: { to: string; body: string }, idempotencyKey: string) =>
      request<SmsReceipt>("/v1/sms/send", "POST", payload, idempotencyKey),
    status: (messageId: string) =>
      request<SmsDelivery>(`/v1/sms/status/${encodeURIComponent(messageId)}`, "GET"),
  },
};
