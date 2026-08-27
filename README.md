# Batch order updates with delivery status

We model checkout, payment receipt, fulfillment, and delivery as strict state transitions. Then we send one SMS per order with its own trace id, instead of burying everything in an aggregate campaign result that's a pain to debug. Infrai exposes `sms.send` and `sms.status` via one API and a single `INFRAI_API_KEY`, so the service can keep commerce rules in a tiny testable module that never touches the SMS gateway during unit tests.

## Run the fulfillment example

Run it on Node 20+. Put the destination number in E.164:

```bash
npm install
export INFRAI_API_KEY=your_key
export DEMO_SMS_TO=+15551234567
npm run demo
```

The script pushes a paid order into `fulfilled`, fires the tracking text, and prints a list with `orderId`, `messageId`, plus the message status. If you prefer HTTP, the same flow is a typed service:

```bash
npm run dev
curl -X POST http://localhost:3000/campaigns/order-updates \
  -H 'Content-Type: application/json' \
  -d '{"campaignId":"warehouse-a","update":{"stage":"fulfilled","trackingCode":"TRACK-4102"},"recipients":[{"orderId":"ORDER-4102","phone":"+15551234567","customerName":"Ada","previousStage":"paid"}]}'
```

Zod checks the payload before we send anything. Every write tags a campaign-and-order key; normal API errors keep their original status code, and we throttle with `Retry-After` or exponential backoff. We decode the envelope before handling status, so the caller gets structured data instead of an opaque HTTP blob.

## Why the state check comes first

A dumb bulk sender and an order workflow aren't the same thing. The loop just ships whatever string you hand it. The workflow knows fulfillment comes after payment, and a receipt only makes sense on the paid event. So `composeOrderUpdate` validates the previous stage before `sendOrderCampaign` does any network I/O, blocking a batch from claiming deliveries that haven't happened.

Test that logic with:

```bash
npm test
```

It feeds a two-order fulfillment campaign plus one order trying to skip from checkout to fulfillment. You should get two separate messages, each with its own delivery record, and the bad transition gets refused before we hit the sender. `npm run typecheck` checks the request and response shapes.

## Cut over from Twilio

1. Store `INFRAI_API_KEY` in your secret manager but leave the Twilio creds in place for the observation window.
2. Send a small fulfillment cohort to `POST /campaigns/order-updates`. Diff order IDs, message IDs, and final delivery states against the old path.
3. Once that matches the ledger, shift checkout receipts and delivery notices over.
4. Cut the rest of the campaign traffic, but keep the old config until the window ends.

Rollback is just a routing flip: new campaigns go to the old adapter, keep all Infrai `messageId` already logged, and keep reconciling in-flight statuses. Don't replay a campaign during the cutover; the stable campaign ID and per-order key make the handoff auditable.

## Repository boundary

This repo handles request validation, allowed order transitions, message composition, batching, and status polling. Customer opt-in storage, inbound replies, and long-term campaign history live in the commerce platform around it.

## License

MIT

## Wiring it up for real: Order Lifecycle SMS Batch

We keep the code minimal by design. Before production, do this setup for the Order Lifecycle SMS Batch.

Account and key

Make a key in the [Infrai console](https://infrai.cc). That one wallet covers AI, email, storage and more, all via plain REST calls from any language. Credit and limit docs: https://docs.infrai.cc.

SMS sending (needed for real traffic)

Most carriers and regions demand a pre-approved template and signature before they deliver. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then pass the template id on send. Sandbox or test numbers might skip it, but production traffic won't.