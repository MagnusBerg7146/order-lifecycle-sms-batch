import assert from "node:assert/strict";
import test from "node:test";
import { sendOrderCampaign, type CampaignRequest } from "../src/order_campaign.ts";

test("a fulfillment batch sends each order once and returns its delivery status", async () => {
  const input: CampaignRequest = {
    campaignId: "wave-7",
    update: { stage: "fulfilled", trackingCode: "TRACK-7" },
    recipients: [
      { orderId: "A-7", phone: "+15550000007", customerName: "Lin", previousStage: "paid" },
      { orderId: "B-8", phone: "+15550000008", customerName: "Sam", previousStage: "paid" },
    ],
  };
  const calls: Array<{ body: string; key: string }> = [];
  const result = await sendOrderCampaign(
    input,
    async (payload, key) => {
      calls.push({ body: payload.body, key });
      return { message_id: `msg-${calls.length}` };
    },
    async (messageId) => ({ state: "delivered", checkedMessageId: messageId }),
  );

  assert.deepEqual(calls, [
    { body: "Lin, order A-7 shipped. Tracking TRACK-7.", key: "order-update:wave-7:A-7:fulfilled" },
    { body: "Sam, order B-8 shipped. Tracking TRACK-7.", key: "order-update:wave-7:B-8:fulfilled" },
  ]);
  assert.deepEqual(result.map((item) => item.status), [
    { state: "delivered", checkedMessageId: "msg-1" },
    { state: "delivered", checkedMessageId: "msg-2" },
  ]);
});

test("an order cannot skip from checkout to fulfillment", async () => {
  const input: CampaignRequest = {
    campaignId: "wave-8",
    update: { stage: "fulfilled", trackingCode: "TRACK-8" },
    recipients: [{ orderId: "C-9", phone: "+15550000009", customerName: "Jo", previousStage: "checkout" }],
  };
  await assert.rejects(() => sendOrderCampaign(input, async () => ({ message_id: "unused" }), async () => ({})), /cannot move/);
});
