// api/webhook.js — temporary WhatsApp status logger (Vercel serverless)
// Env var required: WEBHOOK_VERIFY_TOKEN (any random string you choose)

export default async function handler(req, res) {
  // 1) Meta's one-time verification handshake
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // 2) Incoming events: log message statuses (sent / delivered / read / failed)
  if (req.method === "POST") {
    console.log("WA EVENT:", JSON.stringify(req.body));
    try {
      const entries = req.body?.entry || [];
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const value = change.value || {};

          for (const s of value.statuses || []) {
            console.log(
              "WA STATUS:",
              JSON.stringify({
                id: s.id,
                status: s.status,
                recipient: s.recipient_id,
                pricing: s.pricing,
                errors: s.errors,
              }),
            );
          }

          for (const m of value.messages || []) {
            console.log("WA INBOUND:", m.from, m.type);
          }
        }
      }
    } catch (err) {
      console.error("Webhook parse error:", err);
    }
    // Always return 200 quickly so Meta doesn't retry
    return res.status(200).send("OK");
  }

  return res.status(405).send("Method not allowed");
}
