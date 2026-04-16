/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║   SmartComply SDK — Browser Integration (Built-in UI)            ║
 * ╠═══════════════════════════════════════════════════════════════════╣
 * ║                                                                   ║
 * ║  This example shows how a third-party app integrates SmartComply  ║
 * ║  using the built-in liveness UI (camera, face detection, action   ║
 * ║  detection — all handled automatically).                          ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * This is the simplest integration — drop it into your HTML page.
 *
 * Architecture:
 *
 *   [Your HTML Page]
 *       ↓
 *   [SmartComply SDK (browser)]
 *       ↓ (manages camera, face detection, video recording)
 *   [Adhere Backend API]
 *       ↓ (webhook)
 *   [Your Server]
 */

import SmartComply from "smartcomply-web-sdk";

// ─────────────────────────────────────────────────────────────────────
// HTML Setup:
//
//   <div id="liveness-container"></div>
//   <button id="start-kyc">Start Verification</button>
//   <div id="result"></div>
//
// ─────────────────────────────────────────────────────────────────────

const sdk = new SmartComply({
  apiKey: "pk_test_smartcomply_sandbox_key",
  clientId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  environment: "sandbox",
});

const startBtn = document.getElementById("start-kyc")!;
const container = document.getElementById("liveness-container")!;
const resultDiv = document.getElementById("result")!;

startBtn.addEventListener("click", async () => {
  startBtn.setAttribute("disabled", "true");
  resultDiv.textContent = "";

  try {
    // 1. Create session
    await sdk.createSession();
    console.log("Session created");

    // 2. Load SDK config (brand, theme, channels)
    const config = await sdk.initializeConfig();
    console.log("Config loaded:", config.brand_name);

    // 3. Verify identity first (NIN example)
    const identity = await sdk.onboarding.verify({
      onboarding_type: "nin",
      id_number: "12345678901",  // from user input
      country: "NG",
    });
    console.log("Identity verified:", identity.status);

    // 4. Run the full liveness check (camera + detection + recording + submission)
    //    This is the main magic — the SDK handles everything:
    //    - Opens camera with face guide overlay
    //    - Shows challenge actions (BLINK, TURN_LEFT, OPEN_MOUTH)
    //    - Detects face actions via MediaPipe
    //    - Records video automatically
    //    - Captures selfie for autoshot
    //    - Submits everything to the backend

    const submitResult = await sdk.liveness.startCheck(
      container,
      {
        identifier: "12345678901",    // NIN number, passport number, etc.
        identifier_type: "nin",       // matches onboarding_type
        country: "NG",
      },
      ["BLINK", "TURN_LEFT", "OPEN_MOUTH"]  // optional: override actions
    );

    console.log("Liveness submitted:", submitResult);

    // 5. Show result
    resultDiv.innerHTML = `
      <div style="padding:16px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0;">
        <strong>✓ Verification Submitted</strong>
        <p>Entry ID: ${submitResult.id}</p>
        <p>Status: ${submitResult.status}</p>
        <p>Final results will be delivered to your webhook endpoint.</p>
      </div>
    `;

  } catch (error: any) {
    console.error("KYC failed:", error);

    resultDiv.innerHTML = `
      <div style="padding:16px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;">
        <strong>✗ Verification Failed</strong>
        <p>${error.message}</p>
        ${error.errorCode ? `<p>Error code: ${error.errorCode}</p>` : ""}
      </div>
    `;
  } finally {
    startBtn.removeAttribute("disabled");
  }
});
