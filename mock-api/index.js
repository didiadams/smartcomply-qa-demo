/**
 * Mock API Server — mirrors the real Adhere backend contract.
 *
 * All responses use the standard envelope:
 *   { status, code, message, data, request_id }
 *
 * Endpoints:
 *   POST /v1/sdk/session/create/       — session creation (Bearer auth)
 *   GET  /v1/sdk/initialize/       — SDK config loader (x-access-token)
 *   POST /v1/sdk/onboarding/verify/    — identity verification (x-access-token)
 *   POST /v1/sdk/liveness/create/      — liveness entry creation (x-access-token, multipart)
 *   POST /v1/sdk/liveness/submit/      — liveness video submission (x-access-token, multipart)
 *
 * Run: node mock-api/index.js
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");

const app = express();
app.use(cors());

// Serve demo page and built SDK
app.use("/", express.static(path.join(__dirname, "..", "demo")));
app.use("/sdk/dist", express.static(path.join(__dirname, "..", "dist")));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// ── Helpers ──────────────────────────────────────────────────────────

function requestId() {
  return `req_${crypto.randomUUID().slice(0, 12)}`;
}

function success(res, { code, message, data, status = 200 }) {
  return res.status(status).json({
    status: "success",
    code,
    message,
    data,
    request_id: requestId(),
  });
}

function error(res, { code, message, data = {}, status = 400 }) {
  return res.status(status).json({
    status: "error",
    code,
    message,
    data,
    request_id: requestId(),
  });
}

// ── Mock state ───────────────────────────────────────────────────────

const VALID_API_KEY = "pk_test_smartcomply_sandbox_key";
const VALID_CLIENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const sessions = new Map();  // token -> { created_at, expires_at, revoked }
const entries = new Map();   // id -> entry object

let entryCounter = 1;

// ── Session ──────────────────────────────────────────────────────────

app.post("/v1/sdk/session/create/", (req, res) => {
  // Validate Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return error(res, {
      code: "INVALID_API_KEY",
      message: "Missing or malformed Authorization header. Expected: 'Bearer <api_key>'.",
      data: { expected_format: "Bearer <api_key>" },
      status: 401,
    });
  }

  const apiKey = authHeader.split(" ")[1];
  if (apiKey !== VALID_API_KEY) {
    return error(res, {
      code: "INVALID_API_KEY",
      message: "The provided API key is invalid or the branch is not enabled for onboarding.",
      status: 401,
    });
  }

  // Validate client_id
  const clientId = req.body.client_id;
  if (!clientId) {
    return error(res, {
      code: "VALIDATION_ERROR",
      message: "'client_id' is required.",
      data: {
        errors: [{ field: "client_id", message: "This field is required.", code: "required" }],
      },
    });
  }

  if (clientId !== VALID_CLIENT_ID) {
    return error(res, {
      code: "SDK_CONFIG_NOT_FOUND",
      message: "No active SDK configuration found for this client_id.",
      data: { client_id: clientId },
      status: 404,
    });
  }

  // Create session
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  sessions.set(token, {
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    revoked: false,
  });

  return success(res, {
    code: "SESSION_CREATED",
    message: "Session created successfully.",
    data: { token, expires_at: expiresAt },
    status: 201,
  });
});

// ── Session middleware ────────────────────────────────────────────────

function requireSession(req, res, next) {
  const token = req.headers["x-access-token"];
  if (!token) {
    return error(res, {
      code: "INVALID_API_KEY",
      message: "Missing x-access-token header.",
      status: 401,
    });
  }

  const session = sessions.get(token);
  if (!session || session.revoked) {
    return error(res, {
      code: "INVALID_API_KEY",
      message: "Invalid or expired session token.",
      status: 401,
    });
  }

  if (new Date(session.expires_at) < new Date()) {
    return error(res, {
      code: "INVALID_API_KEY",
      message: "Session token has expired.",
      status: 401,
    });
  }

  req.sessionToken = token;
  req.session = session;
  next();
}

// ── SDK Initialize ───────────────────────────────────────────────────

app.get("/v1/sdk/initialize/", requireSession, (req, res) => {
  return success(res, {
    code: "CONFIG_LOADED",
    message: "SDK configuration loaded successfully.",
    data: {
      id: 1,
      brand_name: "Acme Financial Services",
      description: "Identity verification",
      theme: "midnight_blue",
      verification_type: ["data_verification", "document_verification"],
      redirect_url: "https://acme.example.com/callback",
      channels: {
        nigeria: ["nin"],
        global: ["passport", "national_id", "drivers_license"],
      },
    },
  });
});

// ── Onboarding Verify ────────────────────────────────────────────────

app.post("/v1/sdk/onboarding/verify/", requireSession, (req, res) => {
  const { onboarding_type, id_number, country } = req.body;

  if (!onboarding_type) {
    return error(res, {
      code: "VALIDATION_ERROR",
      message: "'onboarding_type' is required.",
      data: {
        errors: [{ field: "onboarding_type", message: "This field is required.", code: "required" }],
      },
    });
  }

  const ALLOWED_TYPES = ["nin", "bvn", "passport", "national_id", "drivers_license"];
  if (!ALLOWED_TYPES.includes(onboarding_type)) {
    return error(res, {
      code: "INVALID_ONBOARDING_TYPE",
      message: `'${onboarding_type}' is not a supported verification type.`,
      data: { provided: onboarding_type, allowed_types: ALLOWED_TYPES },
    });
  }

  const DATA_TYPES = { nin: "NG", bvn: "NG" };
  if (DATA_TYPES[onboarding_type]) {
    if (!id_number) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: `'id_number' is required for ${onboarding_type.toUpperCase()} verification.`,
        data: {
          errors: [{ field: "id_number", message: "This field is required.", code: "required" }],
        },
      });
    }

    // Data verification — instant result
    return success(res, {
      code: "VERIFICATION_COMPLETE",
      message: `${onboarding_type.toUpperCase()} verification successful.`,
      data: {
        status: "verified",
        onboarding_type: onboarding_type,
        verified_at: new Date().toISOString(),
        provider_result: {
          first_name: "Amara",
          last_name: "Okafor",
          phone: "08012345678",
          gender: "female",
          dob: "1990-03-15",
        },
      },
    });
  }

  // Document verification — async (processed after liveness submission)
  return success(res, {
    code: "VERIFICATION_COMPLETE",
    message: `${onboarding_type.toUpperCase()} verification successful.`,
    data: {
      status: "pending",
      onboarding_type: onboarding_type,
      country: country || "NG",
      message: "Document verification will be processed after liveness submission. Upload the document image during liveness entry creation.",
    },
  });
});

// ── Liveness Create ──────────────────────────────────────────────────

app.post(
  "/v1/sdk/liveness/create/",
  requireSession,
  upload.fields([
    { name: "autoshot_file", maxCount: 1 },
    { name: "id_file", maxCount: 1 },
    { name: "snapshot_file", maxCount: 1 },
  ]),
  (req, res) => {
    const { identifier, identifier_type, country } = req.body;
    let challenge_actions;

    try {
      challenge_actions = JSON.parse(req.body.challenge_actions || "[]");
    } catch {
      challenge_actions = [];
    }

    // Validate required fields
    if (!identifier) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: "One or more fields failed validation.",
        data: {
          errors: [{ field: "identifier", message: "This field is required.", code: "required" }],
        },
      });
    }

    if (!req.files?.autoshot_file) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: "One or more fields failed validation.",
        data: {
          errors: [{ field: "autoshot_file", message: "This field is required.", code: "required" }],
        },
      });
    }

    // Validate challenge actions
    const VALID_ACTIONS = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "TURN_HEAD", "OPEN_MOUTH"];
    const invalid = challenge_actions.filter((a) => !VALID_ACTIONS.includes(a));
    if (invalid.length > 0) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: "One or more fields failed validation.",
        data: {
          errors: [{ field: "challenge_actions", message: `Invalid challenge actions: ${JSON.stringify(invalid)}`, code: "invalid" }],
        },
      });
    }

    const id = entryCounter++;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const entry = {
      id,
      client_id: VALID_CLIENT_ID,
      challenge_actions,
      expires_at: expiresAt,
      status: "pending",
      session_token: req.sessionToken,
      identifier,
      identifier_type,
      country,
      has_autoshot: true,
      has_id_file: !!req.files?.id_file,
      submitted_at: null,
    };

    entries.set(id, entry);

    console.log(`[mock] Liveness entry created: id=${id}, actions=${challenge_actions.join(",")}`);

    return success(res, {
      code: "LIVENESS_CREATED",
      message: "Liveness challenge created successfully.",
      data: {
        id: entry.id,
        client_id: entry.client_id,
        challenge_actions: entry.challenge_actions,
        expires_at: entry.expires_at,
        status: entry.status,
      },
      status: 201,
    });
  }
);

// ── Liveness Submit ──────────────────────────────────────────────────

app.post(
  "/v1/sdk/liveness/submit/",
  requireSession,
  upload.single("video_file"),
  (req, res) => {
    const entryId = parseInt(req.body.entry, 10);

    if (!entryId || !entries.has(entryId)) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: "One or more fields failed validation.",
        data: {
          errors: [{ field: "entry", message: "Invalid entry ID.", code: "invalid" }],
        },
      });
    }

    const entry = entries.get(entryId);

    if (entry.submitted_at) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: "Entry already processed",
      });
    }

    if (entry.session_token !== req.sessionToken) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: "This entry does not belong to the provided session.",
      });
    }

    if (!req.file) {
      return error(res, {
        code: "VALIDATION_ERROR",
        message: "One or more fields failed validation.",
        data: {
          errors: [{ field: "video_file", message: "Session auto-recording is required.", code: "required" }],
        },
      });
    }

    // Update entry
    entry.submitted_at = new Date().toISOString();
    entry.status = "processing";

    // Revoke session (single-use)
    const session = sessions.get(req.sessionToken);
    if (session) session.revoked = true;

    const videoSize = req.file ? req.file.size : 0;
    console.log(`[mock] Liveness submitted: entry=${entryId}, video=${(videoSize / 1024).toFixed(1)}KB`);

    return success(res, {
      code: "LIVENESS_SUBMITTED",
      message: "Liveness entry submitted successfully. Processing will begin shortly.",
      data: {
        id: entry.id,
        status: entry.status,
        submitted_at: entry.submitted_at,
        metadata: {
          ip_address: req.ip,
          user_agent: req.headers["user-agent"] || "",
        },
      },
    });
  }
);

// ── Start ────────────────────────────────────────────────────────────
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`\n  Mock Adhere API running on http://localhost:${PORT}`);
  console.log(`  Valid API key:   ${VALID_API_KEY}`);
  console.log(`  Valid client_id: ${VALID_CLIENT_ID}\n`);
});
