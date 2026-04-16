/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║   SmartComply SDK — Headless Integration (Server-Side Pattern)   ║
 * ╠═══════════════════════════════════════════════════════════════════╣
 * ║                                                                   ║
 * ║  This example shows how a third-party fintech app integrates      ║
 * ║  SmartComply for KYC verification WITHOUT using the built-in      ║
 * ║  UI components. Perfect for custom UIs and server-side flows.     ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * Architecture:
 *
 *   [Your Frontend]  →  [Your Backend]  →  [SmartComply API]
 *                                               ↓ (webhook)
 *                                         [Your Backend]
 *
 * Prerequisites:
 *   1. Get your API key from Adhere dashboard
 *   2. Create an SDK Config (brand, channels, webhook URL) via dashboard
 *   3. Copy the client_id UUID from your SDK Config
 *   4. Fund your wallet (verification costs are deducted per call)
 */

import SmartComply, {
  type SDKInitConfig,
  type VerifyIdentityResponse,
  type LivenessCreateResponse,
  type LivenessSubmitResponse,
  type ChallengeAction,
} from "smartcomply-web-sdk";

// ─────────────────────────────────────────────────────────────────────
// STEP 1: Initialize the SDK
// ─────────────────────────────────────────────────────────────────────

const sdk = new SmartComply({
  // Your API key from the Adhere dashboard
  apiKey: "pk_live_your_actual_api_key",

  // UUID from your SDK Config (created in Adhere dashboard)
  clientId: "your-sdk-config-client-id-uuid",

  // "sandbox" for testing, "production" for live
  environment: "production",

  // Optional: request timeout in ms (default: 30000)
  timeout: 30000,
});


// ─────────────────────────────────────────────────────────────────────
// STEP 2: Create Session + Fetch Config
// ─────────────────────────────────────────────────────────────────────

async function initializeSession() {
  // Create a session (valid for 30 minutes)
  const session = await sdk.createSession();
  console.log("Session token:", session.token);
  console.log("Expires at:", session.expires_at);

  // Fetch your SDK config (channels, brand, theme)
  const config: SDKInitConfig = await sdk.initializeConfig();
  console.log("Brand:", config.brand_name);
  console.log("Available channels:", config.channels);
  // Example: { "nigeria": ["nin"], "global": ["passport", "national_id"] }

  return { session, config };
}


// ─────────────────────────────────────────────────────────────────────
// STEP 3A: Verify Identity — Nigerian (NIN/BVN - Data Verification)
// ─────────────────────────────────────────────────────────────────────

async function verifyNigerianIdentity(
  ninNumber: string
): Promise<VerifyIdentityResponse> {
  const result = await sdk.onboarding.verify({
    onboarding_type: "nin",
    id_number: ninNumber,
    country: "NG",
  });

  // Result is instant for data verification:
  // {
  //   status: "verified",
  //   onboarding_type: "nin",
  //   verified_at: "2026-04-13T18:00:00Z",
  //   provider_result: { first_name: "...", last_name: "...", ... }
  // }

  if (result.status === "verified") {
    console.log("✓ NIN verified! Data:", result.provider_result);
  } else {
    console.log("✗ Verification failed");
  }

  return result;
}


// ─────────────────────────────────────────────────────────────────────
// STEP 3B: Verify Identity — International (Document)
// ─────────────────────────────────────────────────────────────────────

async function verifyInternationalIdentity(
  documentType: "passport" | "national_id" | "drivers_license",
  country: string
): Promise<VerifyIdentityResponse> {
  const result = await sdk.onboarding.verify({
    onboarding_type: documentType,
    country: country, // ISO 2-char e.g. "US", "GB", "KE"
  });

  // Document verification returns "pending" — the actual document
  // image is uploaded during liveness entry creation (Step 4)
  // Result:
  // {
  //   status: "pending",
  //   onboarding_type: "passport",
  //   country: "US",
  //   message: "Document verification will be processed after liveness submission..."
  // }

  console.log("Document intent registered:", result.message);
  return result;
}


// ─────────────────────────────────────────────────────────────────────
// STEP 4: Create Liveness Entry (with selfie + optional document)
// ─────────────────────────────────────────────────────────────────────

async function createLivenessEntry(
  selfieFile: File | Blob,
  identityInfo: {
    identifier: string;        // NIN number, passport number, etc.
    identifier_type: string;   // "nin" | "passport" | "national_id" | "drivers_license"
    country: string;           // ISO 2-char
  },
  documentImageFile?: File | Blob
): Promise<LivenessCreateResponse> {
  const entry = await sdk.liveness.create({
    identifier: identityInfo.identifier,
    identifier_type: identityInfo.identifier_type,
    country: identityInfo.country,
    challenge_actions: ["BLINK", "TURN_LEFT", "OPEN_MOUTH"] as ChallengeAction[],
    autoshot_file: selfieFile,
    id_file: documentImageFile,  // Optional document image for face-to-document match
  });

  // Response:
  // {
  //   id: 42,
  //   client_id: "uuid-...",
  //   challenge_actions: ["BLINK", "TURN_LEFT", "OPEN_MOUTH"],
  //   expires_at: "2026-04-13T18:10:00Z",
  //   status: "pending"
  // }

  console.log("Liveness entry created:", entry.id);
  console.log("Perform these actions:", entry.challenge_actions);

  return entry;
}


// ─────────────────────────────────────────────────────────────────────
// STEP 5: Submit Liveness Video
// ─────────────────────────────────────────────────────────────────────

async function submitLivenessVideo(
  entryId: number,
  videoBlob: Blob
): Promise<LivenessSubmitResponse> {
  const result = await sdk.liveness.submit(entryId, videoBlob);

  // Response:
  // {
  //   id: 42,
  //   status: "processing",   ← NOT "verified" — result comes via webhook
  //   submitted_at: "2026-04-13T18:01:00Z",
  //   metadata: { ip_address: "...", user_agent: "..." }
  // }

  // ⚠️ IMPORTANT: After submission, the session is REVOKED.
  //    You must create a new session for any further operations.

  console.log("Submitted! Status:", result.status);
  console.log("→ Final result will arrive via webhook");

  return result;
}


// ─────────────────────────────────────────────────────────────────────
// STEP 6: Handle Webhook (on YOUR server)
// ─────────────────────────────────────────────────────────────────────

/**
 * Your server receives webhooks at the URL configured in your SDK Config.
 *
 * Webhook event: POST to your webhook_url
 *
 * Headers:
 *   Content-Type: application/json
 *   X-Adhere-Signature: <HMAC-SHA256 signature>
 *
 * Body:
 *   {
 *     "event": "liveness.completed",
 *     "data": {
 *       "entry_id": 42,
 *       "status": "passed" | "failed",
 *       "is_verified": true,
 *       "match_score": 0.234,  ← DeepFace distance (lower = more similar)
 *       "metadata": { "ip_address": "...", "user_agent": "..." },
 *       "document_verification": {   ← only if document was uploaded
 *         "status": "verified" | "failed" | "expired_document",
 *         "document_type": "passport",
 *         "is_expired": false,
 *         "face_match_verified": true,
 *         "face_match_score": 0.312,
 *         "extracted_name": "AMARA OKAFOR",
 *         "extracted_expiry_date": "2030-06-15"
 *       }
 *     }
 *   }
 */

// Example Express.js webhook handler:
function exampleWebhookHandler() {
  // This is pseudo-code — run on YOUR server, not in the SDK
  /*
  const crypto = require("crypto");
  const express = require("express");
  const app = express();

  app.post("/webhook/smartcomply", express.json(), (req, res) => {
    // 1. Verify signature
    const signature = req.headers["x-adhere-signature"];
    const payload = JSON.stringify(req.body);  // use compact JSON
    const expected = crypto
      .createHmac("sha256", process.env.WEBHOOK_SECRET)  // from your SDK Config
      .update(payload)
      .digest("hex");

    if (signature !== expected) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // 2. Handle event
    const { event, data } = req.body;

    if (event === "liveness.completed") {
      if (data.status === "passed" && data.is_verified) {
        // ✓ User is verified — update your database
        updateUserKYCStatus(data.entry_id, "verified");
      } else {
        // ✗ Verification failed
        updateUserKYCStatus(data.entry_id, "failed");
      }

      // Check document verification if applicable
      if (data.document_verification) {
        const doc = data.document_verification;
        if (doc.is_expired) {
          // Document has expired
        } else if (!doc.face_match_verified) {
          // Face on document doesn't match selfie
        } else {
          // Everything passed!
        }
      }
    }

    res.json({ received: true });
  });
  */
}


// ─────────────────────────────────────────────────────────────────────
// FULL FLOW EXAMPLE
// ─────────────────────────────────────────────────────────────────────

async function fullKYCFlow() {
  try {
    // 1. Initialize
    const { config } = await initializeSession();

    // 2. Determine verification type based on user's country
    const userCountry = "NG";  // from user input

    if (userCountry === "NG") {
      // Nigerian user → NIN data verification
      const ninResult = await verifyNigerianIdentity("12345678901");

      if (ninResult.status !== "verified") {
        throw new Error("NIN verification failed");
      }

      // 3. Liveness with NIN
      const selfie = await captureUserSelfie();  // your camera logic
      const entry = await createLivenessEntry(selfie, {
        identifier: "12345678901",
        identifier_type: "nin",
        country: "NG",
      });

      // 4. Record video and submit
      const video = await recordUserVideo();  // your recording logic
      await submitLivenessVideo(entry.id, video);

    } else {
      // International user → document verification
      await verifyInternationalIdentity("passport", userCountry);

      // 3. Liveness with document image
      const selfie = await captureUserSelfie();
      const passportPhoto = await captureDocumentPhoto();  // your camera/upload logic
      const entry = await createLivenessEntry(
        selfie,
        {
          identifier: "A12345678",
          identifier_type: "passport",
          country: userCountry,
        },
        passportPhoto  // document image for face-to-document match
      );

      // 4. Record video and submit
      const video = await recordUserVideo();
      await submitLivenessVideo(entry.id, video);
    }

    console.log("✓ KYC flow complete — awaiting webhook for final result");

  } catch (err: any) {
    // Error handling
    if (err.name === "AuthError") {
      console.error("Authentication failed:", err.message);
    } else if (err.name === "NetworkError") {
      console.error("Network issue:", err.message);
    } else if (err.errorCode === "INSUFFICIENT_BALANCE") {
      console.error("Wallet balance too low:", err.errorData);
    } else {
      console.error("Error:", err.message, err.errorCode);
    }
  }
}

// Placeholder functions — implement these with your camera/UI library
async function captureUserSelfie(): Promise<Blob> {
  throw new Error("Implement with your camera library");
}
async function captureDocumentPhoto(): Promise<Blob> {
  throw new Error("Implement with your camera/upload library");
}
async function recordUserVideo(): Promise<Blob> {
  throw new Error("Implement with MediaRecorder API");
}
