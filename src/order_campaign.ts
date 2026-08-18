import { z } from "zod";
import { infrai, type SmsDelivery, type SmsReceipt } from "./infrai_sms.ts";

const recipientSchema = z.object({
  orderId: z.string().min(1),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  customerName: z.string().min(1).max(60),
  previousStage: z.enum(["checkout", "paid", "fulfilled"]),
});

export const campaignRequestSchema = z.object({
  campaignId: z.string().min(1).max(80),
  update: z.discriminatedUnion("stage", [
    z.object({ stage: z.literal("paid"), receiptNumber: z.string().min(1) }),
    z.object({ stage: z.literal("fulfilled"), trackingCode: z.string().min(1) }),
    z.object({ stage: z.literal("delivered") }),
  ]),
  recipients: z.array(recipientSchema).min(1).max(100),
});

export type CampaignRequest = z.infer<typeof campaignRequestSchema>;
type SendSms = (payload: { to: string; body: string }, key: string) => Promise<SmsReceipt>;
type GetStatus = (messageId: string) => Promise<SmsDelivery>;

const allowedPrevious = { paid: "checkout", fulfilled: "paid", delivered: "fulfilled" } as const;

export function composeOrderUpdate(input: CampaignRequest, recipient: CampaignRequest["recipients"][number]): string {
  if (recipient.previousStage !== allowedPrevious[input.update.stage]) {
    throw new Error(`Order ${recipient.orderId} cannot move from ${recipient.previousStage} to ${input.update.stage}`);
  }
  const opening = `${recipient.customerName}, order ${recipient.orderId}`;
  switch (input.update.stage) {
    case "paid": return `${opening} is paid. Receipt ${input.update.receiptNumber}.`;
    case "fulfilled": return `${opening} shipped. Tracking ${input.update.trackingCode}.`;
    case "delivered": return `${opening} was delivered.`;
  }
  throw new Error("Unknown order stage");
}

export async function sendOrderCampaign(
  input: CampaignRequest,
  sendSms: SendSms = infrai.sms.send,
  getStatus: GetStatus = infrai.sms.status,
) {
  const sent = await Promise.all(input.recipients.map(async (recipient) => {
    const message = composeOrderUpdate(input, recipient);
    const receipt = await sendSms(
      { to: recipient.phone, body: message },
      `order-update:${input.campaignId}:${recipient.orderId}:${input.update.stage}`,
    );
    return { orderId: recipient.orderId, messageId: receipt.message_id };
  }));

  return Promise.all(sent.map(async (item) => ({
    ...item,
    status: await getStatus(item.messageId),
  })));
}
