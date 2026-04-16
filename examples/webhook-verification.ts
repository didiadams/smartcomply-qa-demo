/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║   SmartComply — Webhook Verification Utility                     ║
 * ╠═══════════════════════════════════════════════════════════════════╣
 * ║                                                                   ║
 * ║  Server-side utility for verifying webhook signatures from the    ║
 * ║  Adhere backend. Use this on YOUR server to validate that         ║
 * ║  incoming webhooks are genuinely from SmartComply.                ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * The Adhere backend signs webhook payloads with HMAC-SHA256 using
 * the webhook_secret from your SDK Config (UUID without dashes).
 *
 * Signature header: X-Adhere-Signature
 *
 * Usage (Express.js):
 *   const { verifyWebhookSignature } = require("./webhook-verification");
 *
 *   app.post("/webhook", express.json(), (req, res) => {
 *     const isValid = verifyWebhookSignature(
 *       req.body,
 *       req.headers["x-adhere-signature"],
 *       process.env.WEBHOOK_SECRET
 *     );
 *     if (!isValid) return res.status(401).send("Invalid signature");
 *     // ... handle webhook
 *   });
 */

import * as crypto from "crypto";

/**
 * Verify the HMAC-SHA256 signature on an incoming webhook from Adhere.
 *
 * @param payload - The parsed JSON body from the webhook request
 * @param signature - The X-Adhere-Signature header value
 * @param webhookSecret - Your webhook_secret UUID from SDK Config (with or without dashes)
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(
  payload: Record<string, unknown>,
  signature: string | undefined,
  webhookSecret: string
): boolean {
  if (!signature || !webhookSecret) return false;

  // Backend strips dashes from UUID secret before signing
  const secretKey = webhookSecret.replace(/-/g, "");

  // Backend uses compact JSON (no spaces) with separators (",", ":")
  const payloadString = JSON.stringify(payload);

  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(payloadString, "utf8")
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────
// Full Express.js Webhook Handler Example
// ─────────────────────────────────────────────────────────────────────

/*
import express from "express";

const app = express();

// IMPORTANT: Use JSON body parser for webhook endpoint
app.post("/webhook/smartcomply", express.json(), (req, res) => {
  // 1. Verify signature
  const isValid = verifyWebhookSignature(
    req.body,
    req.headers["x-adhere-signature"] as string,
    process.env.ADHERE_WEBHOOK_SECRET!
  );

  if (!isValid) {
    console.error("⚠ Invalid webhook signature — possible spoofing attempt");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // 2. Extract event data
  const { event, data } = req.body;

  switch (event) {
    case "liveness.completed": {
      const {
        entry_id,
        status,
        is_verified,
        match_score,
        document_verification,
      } = data;

      console.log(`Liveness ${entry_id}: ${status}, verified=${is_verified}`);

      if (status === "passed" && is_verified) {
        // ✓ User verified — update your database
        // updateUserStatus(entry_id, "verified");

        if (document_verification) {
          console.log("Document:", document_verification.status);
          console.log("Name:", document_verification.extracted_name);
          console.log("Expired:", document_verification.is_expired);
          console.log("Face match:", document_verification.face_match_verified);
        }

      } else {
        // ✗ Failed — notify user
        // updateUserStatus(entry_id, "failed");
        console.log("Failed — user must retry");
      }

      break;
    }

    default:
      console.log("Unknown webhook event:", event);
  }

  // 3. Acknowledge receipt (Adhere retries on non-2xx or timeout)
  res.json({ received: true });
});

app.listen(3000, () => {
  console.log("Webhook server running on port 3000");
});
*/
