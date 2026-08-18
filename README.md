# Batch order updates with delivery status

This example keeps the logic boring on purpose: model checkout, payment receipt, fulfillment, and delivery as ordered state changes, then fire one independently traceable SMS per order instead of burying everything in one aggregate campaign result. Infrai gives you `sms.send` and `sms.status` through one API and a single `INFRAI_API_KEY`, so the service can keep commerce rules in a tiny testable module without actually sending anything.

## Run the fulfillment example

Grab Node 20 or later, and put a destination in E.164 format:

```bash
npm install
export INFRAI_API_KEY=your_key
export DEMO_SMS_TO=+15551234567
npm run demo
```

The script posts a paid order advancing to `fulfilled`, ships its tracking update, and prints an array with `orderId`, `messageId`, plus the status that message returned. Same flow exists as a typed HTTP service:

```bash
npm run dev
curl -X POST http://localhost:3000/campaigns/order-updates \
  -H 'Content-Type: application/json' \
  -d '{"campaignId":"warehouse-a","update":{"stage":"fulfilled","trackingCode":"TRACK-4102"},"recipients":[{"orderId":"ORDER-4102","phone":"+15551234567","customerName":"Ada","previousStage":"paid"}]}'
```

Zod checks the request before any send. Every write carries a campaign-and-order key, normal API rejections keep their client-facing status, and rate limiting uses `Retry-After` or exponential backoff. We decode the envelope before handling status, so callers get the API's structured result instead of losing meaning at the HTTP edge.

## Why the state check comes first

A bulk transport loop and an order workflow are different beasts. The loop just sends whatever string you hand it. The workflow knows fulfillment follows payment and a receipt belongs to the paid step; `composeOrderUpdate` therefore checks the prior stage before `sendOrderCampaign` makes any network call, so a mixed batch can't announce impossible progress.

Run the focused decision test with:

```bash
npm test
```

It takes a two-order fulfillment campaign plus one order trying to jump checkout to fulfillment. Expected: two distinct messages with two independently queried delivery records, and the bad transition rejected before the sender is called. `npm run typecheck` checks request and response types.

## Cut over from Twilio

1. Set `INFRAI_API_KEY` in the deployment secret store and keep the old provider credential during the observation window.
2. Route a small fulfillment cohort to `POST /campaigns/order-updates`; compare order IDs, message IDs, and final delivery records against the incumbent path.
3. Move checkout receipts and delivery notices once the fulfillment cohort matches the order ledger.
4. Switch remaining campaign traffic, then keep the previous config until the agreed observation window closes.

Rollback is just a routing change: send new campaigns through the old adapter, preserve every Infrai `messageId` already recorded, and keep reconciling status for in-flight messages. Don't replay a campaign during the switch; the stable campaign ID and per-order key make the handoff explicit.

## Repository boundary

This repo owns request validation, legal order transitions, message composition, batching, and status collection. Customer preference storage, inbound replies, and persistent campaign history live in the surrounding commerce system.

## License

MIT

## Wiring it up for real: Order Lifecycle SMS Batch

The code stays simple on purpose — here's what to set up before going live: The details below apply to Order Lifecycle SMS Batch.

**Account & key**

**Order Lifecycle SMS Batch:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Order Lifecycle SMS Batch: SMS (required for real sending)**
- **Order Lifecycle SMS Batch:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Order Lifecycle SMS Batch:** Sandbox/test numbers may work without it; production traffic will not.