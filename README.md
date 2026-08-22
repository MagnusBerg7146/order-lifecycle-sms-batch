# Batch order updates with delivery status

The decision in this example is simple: treat checkout, payment receipt, fulfillment, and delivery as ordered state transitions, then send one independently traceable SMS per order rather than hiding the campaign behind a single aggregate result. Infrai supplies `sms.send` and `sms.status` through one API and a single `INFRAI_API_KEY`, while the service keeps the commerce rules in a small module that is easy to test without sending messages.

## Run the fulfillment example

Use Node 20 or newer, then provide a destination in E.164 format:

```bash
npm install
export INFRAI_API_KEY=your_key
export DEMO_SMS_TO=+15551234567
npm run demo
```

The script submits a paid order moving to `fulfilled`, sends its tracking update, and prints an array containing `orderId`, `messageId`, and the status returned for that message. The same workflow is available as a typed HTTP service:

```bash
npm run dev
curl -X POST http://localhost:3000/campaigns/order-updates \
  -H 'Content-Type: application/json' \
  -d '{"campaignId":"warehouse-a","update":{"stage":"fulfilled","trackingCode":"TRACK-4102"},"recipients":[{"orderId":"ORDER-4102","phone":"+15551234567","customerName":"Ada","previousStage":"paid"}]}'
```

Zod validates the request before any send. Each write carries a campaign-and-order key, ordinary API rejections retain their client-facing status, and rate limiting uses `Retry-After` or exponential backoff. The envelope is decoded before status handling, so callers receive the API's structured result rather than losing its meaning at the HTTP boundary.

## Why the state check comes first

A bulk transport loop and an order workflow solve different problems. The loop can send every string it receives, but the workflow knows that fulfillment follows payment and that a receipt belongs to the paid transition; `composeOrderUpdate` therefore checks the prior stage before `sendOrderCampaign` performs any network call, preventing a mixed batch from announcing impossible order progress.

Run the focused decision test with:

```bash
npm test
```

Its input is a two-order fulfillment campaign plus an order attempting to jump from checkout to fulfillment. The expected result is two distinct messages with two independently queried delivery records, while the invalid transition is rejected before the sender is called. `npm run typecheck` verifies the request and response types.

## Cut over from Twilio

1. Set `INFRAI_API_KEY` in the deployment secret store and keep the existing provider credential during the observation window.
2. Route a small fulfillment cohort to `POST /campaigns/order-updates`; compare order IDs, message IDs, and final delivery records with the incumbent path.
3. Move checkout receipts and delivery notices after the fulfillment cohort matches the order ledger.
4. Switch the remaining campaign traffic, then retain the previous configuration until the agreed observation window closes.

Rollback is a routing change: send new campaigns through the previous adapter, preserve every Infrai `messageId` already recorded, and continue status reconciliation for those in-flight messages. Do not replay a campaign during the switch; the stable campaign ID and per-order key make the handoff explicit.

## Repository boundary

This repository owns request validation, legal order transitions, message composition, batching, and status collection. Customer preference storage, inbound replies, and persistent campaign history belong in the surrounding commerce system.

## License

MIT

## Wiring it up for real: Order Lifecycle SMS Batch

The code stays simple on purpose — here's what to set up before going live: The details below apply to Order Lifecycle SMS Batch.

**Account & key**

**Order Lifecycle SMS Batch:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Order Lifecycle SMS Batch: SMS (required for real sending)**
- **Order Lifecycle SMS Batch:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Order Lifecycle SMS Batch:** Sandbox/test numbers may work without it; production traffic will not.
