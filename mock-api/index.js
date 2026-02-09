const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// Accept multipart form data (for video upload)
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// ── Session ──────────────────────────────────────────────────────────
app.post("/v1/session/create", (req, res) => {
  res.json({
    token: "sess_" + crypto.randomUUID().slice(0, 12),
  });
});

// ── Onboarding ───────────────────────────────────────────────────────
app.post("/v1/onboarding/verify", (req, res) => {
  const { onboarding_type, id_number, name_to_confirm } = req.body;
  res.json({
    session_id: req.body.session_id || "sess_mock",
    status: "verified",
    match: {
      name_matched: true,
      confidence: 0.95,
    },
  });
});

// ── Liveness ─────────────────────────────────────────────────────────
const ACTIONS = [
  "smile",
  "blink",
  "turn_left",
  "turn_right",
  "nod",
  "open_mouth",
  "raise_eyebrows",
  "close_eyes",
  "look_up",
  "look_down",
  "puff_cheeks",
  "pucker_lips",
];

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

app.post("/v1/liveness/start", (req, res) => {
  const actions = pickRandom(ACTIONS, 3);
  res.json({
    challenge_id: "ch_" + crypto.randomUUID().slice(0, 12),
    actions,
    instruction: "Complete the following actions to verify your identity",
    time_limit_seconds: 45,
    expires_at: new Date(Date.now() + 60000).toISOString(),
  });
});

app.post("/v1/liveness/verify", upload.single("video"), (req, res) => {
  const videoSize = req.file ? req.file.size : 0;
  console.log(
    `[mock] Liveness verify — challenge_id=${req.body.challenge_id}, video=${(videoSize / 1024).toFixed(1)}KB`
  );

  res.json({
    status: "verified",
    verification_score: 0.97,
    detected_actions: ["smile", "blink", "turn_left"],
    actions_matched: true,
    verified_at: new Date().toISOString(),
  });
});

// ── Start ────────────────────────────────────────────────────────────
const PORT = 8000;
app.listen(PORT, () =>
  console.log(`Mock API running on http://localhost:${PORT}`)
);
