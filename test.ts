/**
 * test.ts — Integration test against the Adhere mock API.
 *
 * Tests the full SDK flow:
 *   1. Create session (Bearer auth + client_id)
 *   2. Initialize SDK config (x-access-token)
 *   3. Verify identity (NIN data verification)
 *   4. Create liveness entry (multipart + autoshot)
 *   5. Submit liveness video (multipart + entry ID)
 *
 * Run the mock API first:
 *   node mock-api/index.js
 *
 * Then run this test (requires ts-node or similar):
 *   npx tsx test.ts
 */

import SmartComply from "./src";

// Polyfill for File/Blob in Node.js (only needed for testing outside browser)
function createMockFile(name: string, type: string, sizeKB: number): Blob {
  const content = new Uint8Array(sizeKB * 1024);
  return new Blob([content], { type });
}

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SmartComply Web SDK — Integration Test");
  console.log("  Against mock Adhere backend @ http://localhost:8000");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Step 0: Initialize SDK ──────────────────────────────────────
  const sdk = new SmartComply({
    apiKey: "pk_test_smartcomply_sandbox_key",
    clientId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    environment: "sandbox",
  });

  console.log("✓ SDK initialized\n");

  // ── Step 1: Create session ──────────────────────────────────────
  console.log("─── Step 1: Create Session ───────────────────────────");
  const session = await sdk.createSession();
  console.log("  Token:", session.token);
  console.log("  Expires:", session.expires_at);
  console.log("  ✓ Session created\n");

  // ── Step 2: Initialize SDK config ───────────────────────────────
  console.log("─── Step 2: Initialize Config ───────────────────────");
  const config = await sdk.initializeConfig();
  console.log("  Brand:", config.brand_name);
  console.log("  Theme:", config.theme);
  console.log("  Channels:", JSON.stringify(config.channels));
  console.log("  Verification types:", config.verification_type);
  console.log("  ✓ Config loaded\n");

  // ── Step 3: Verify identity (NIN — data verification) ──────────
  console.log("─── Step 3: Verify Identity (NIN) ──────────────────");
  const ninResult = await sdk.onboarding.verify({
    onboarding_type: "nin",
    id_number: "12345678901",
    country: "NG",
  });
  console.log("  Status:", ninResult.status);
  console.log("  Type:", ninResult.onboarding_type);
  console.log("  Verified at:", ninResult.verified_at);
  console.log("  Provider data:", JSON.stringify(ninResult.provider_result));
  console.log("  ✓ NIN verified\n");

  // ── Step 4: Verify identity (Passport — document verification) ─
  console.log("─── Step 4: Verify Identity (Passport) ─────────────");
  const passportResult = await sdk.onboarding.verify({
    onboarding_type: "passport",
    country: "US",
  });
  console.log("  Status:", passportResult.status);
  console.log("  Message:", passportResult.message);
  console.log("  ✓ Document intent stored (pending liveness)\n");

  // ── Step 5: Create liveness entry ──────────────────────────────
  console.log("─── Step 5: Create Liveness Entry ──────────────────");
  const autoshotFile = createMockFile("selfie.jpg", "image/jpeg", 50);
  const idDocFile = createMockFile("passport.jpg", "image/jpeg", 100);

  const entry = await sdk.liveness.create({
    identifier: "A12345678",
    identifier_type: "passport",
    country: "US",
    challenge_actions: ["BLINK", "TURN_LEFT", "OPEN_MOUTH"],
    autoshot_file: autoshotFile,
    id_file: idDocFile,
  });
  console.log("  Entry ID:", entry.id);
  console.log("  Client ID:", entry.client_id);
  console.log("  Actions:", entry.challenge_actions);
  console.log("  Status:", entry.status);
  console.log("  Expires:", entry.expires_at);
  console.log("  ✓ Liveness entry created\n");

  // ── Step 6: Submit liveness video ──────────────────────────────
  console.log("─── Step 6: Submit Liveness Video ──────────────────");
  const videoBlob = createMockFile("liveness.webm", "video/webm", 200);

  const submitResult = await sdk.liveness.submit(entry.id, videoBlob);
  console.log("  Entry ID:", submitResult.id);
  console.log("  Status:", submitResult.status);
  console.log("  Submitted at:", submitResult.submitted_at);
  console.log("  Metadata:", JSON.stringify(submitResult.metadata));
  console.log("  ✓ Liveness submitted (processing via Celery)\n");

  // ── Done ───────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✓ All tests passed! Full flow completed.");
  console.log("  → Results delivered via webhook (liveness.completed)");
  console.log("═══════════════════════════════════════════════════════\n");
}

run().catch((err) => {
  console.error("\n✗ Test failed:", err.message);
  if (err.errorCode) console.error("  Error code:", err.errorCode);
  if (err.errorData) console.error("  Error data:", JSON.stringify(err.errorData));
  process.exit(1);
});
