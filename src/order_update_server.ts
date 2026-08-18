import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_sms.ts";
import { campaignRequestSchema, sendOrderCampaign } from "./order_campaign.ts";

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/campaigns/order-updates") {
    response.writeHead(404).end();
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = campaignRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const messages = await sendOrderCampaign(input);
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ messages }));
  } catch (error) {
    if (error instanceof ZodError) {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_request", issues: error.issues }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    response.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_order_transition" }));
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log("Order update service listening on http://localhost:3000");
});
