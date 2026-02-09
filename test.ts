import SmartComply from "./src";

async function run() {
  const sdk = new SmartComply({
    apiKey: "pk_test_123",
    environment: "sandbox",
  });

  // Step 1: Create a session
  const session = await sdk.createSession();
  console.log("Session created:", session);
  console.log("Session ID:", sdk.sessionId);

  // Step 2: Verify identity (onboarding)
  const verification = await sdk.onboarding.verify({
    onboarding_type: "bvn",
    id_number: "22012345678",
    name_to_confirm: "Amara Okafor",
  });
  console.log("Verification result:", verification);

  if (verification.status !== "verified") {
    console.log("Onboarding failed:", verification);
    return;
  }

  // Step 3: Full liveness check with camera + MediaPipe (browser only)
  // This opens the camera, shows action prompts, detects face actions,
  // records video, and submits to the backend — all in one call.
  const container = document.getElementById("liveness-container")!;
  const livenessResult = await sdk.liveness.startCheck(container);

  console.log("Liveness result:", livenessResult);

  if (livenessResult.status === "verified") {
    console.log("Score:", livenessResult.verification_score);
    console.log("Actions matched:", livenessResult.actions_matched);
  } else {
    console.log("Failed:", livenessResult.reason);
    console.log("Can retry:", livenessResult.can_retry);
  }

  // --- Manual flow (if you want to handle camera yourself) ---
  // const challenge = await sdk.liveness.start();
  // const videoBlob = await recordVideoYourself();
  // const result = await sdk.liveness.verify(challenge.challenge_id, videoBlob);
}

run().catch(console.error);
