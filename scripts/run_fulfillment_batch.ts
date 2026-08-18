import { campaignRequestSchema, sendOrderCampaign } from "../src/order_campaign.ts";

const campaign = campaignRequestSchema.parse({
  campaignId: "warehouse-2026-08-15-a",
  update: { stage: "fulfilled", trackingCode: "TRACK-4102" },
  recipients: [
    { orderId: "ORDER-4102", phone: process.env.DEMO_SMS_TO, customerName: "Ada", previousStage: "paid" },
  ],
});

console.log(JSON.stringify(await sendOrderCampaign(campaign), null, 2));
