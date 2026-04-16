# SmartComply Web SDK

Drop-in identity verification (KYC) for web applications. Add one line of code to verify your users with facial liveness detection, NIN/BVN checks, and international document verification.

## Install

```bash
npm install smartcomply-web-sdk
```

---

## Option 1: Drop-in Widget (Recommended)

The fastest way to add KYC. Opens a complete, branded verification modal — handles everything automatically.

```html
<button id="verify-btn">Verify Identity</button>

<script type="module">
  import { SmartComplyFlow } from "smartcomply-web-sdk";

  document.getElementById("verify-btn").onclick = () => {
    SmartComplyFlow.open({
      apiKey: "pk_live_your_api_key",
      clientId: "your-sdk-config-uuid",
      environment: "production",

      onComplete(result) {
        // Verification submitted! Final result arrives via webhook.
        console.log("Entry ID:", result.entryId);
        console.log("Status:", result.status);  // "processing"
        // Update your UI — tell the user to wait for confirmation
      },

      onError(err) {
        console.error("Verification failed:", err.message);
      },

      onClose() {
        // User closed the modal without completing
      },
    });
  };
</script>
```

That's it. The SDK will:

1. Create a secure session with the Adhere backend
2. Show a branded welcome screen (your brand name + theme from dashboard)
3. Let the user select their country and ID type
4. Collect their NIN/BVN number **or** capture their document photo
5. Run face liveness detection (camera + challenge actions)
6. Record a video and submit everything to the backend
7. Show a result screen and call your `onComplete` callback

### What the User Sees

| Step | Screen | Description |
|------|--------|-------------|
| 1 | Welcome | Your brand name, description, and what to expect |
| 2 | Country | Select country (skipped if your config has only one) |
| 3 | ID Type | Choose NIN, BVN, Passport, National ID, or Driver's License |
| 4a | ID Input | Enter NIN/BVN number (instant backend verification) |
| 4b | Document | Take a photo of passport/ID card or upload from device |
| 5 | Liveness | Camera opens — user blinks, turns head, opens mouth |
| 6 | Done | "Verification Submitted" — user clicks Done |

### `SmartComplyFlow.open()` Options

```typescript
SmartComplyFlow.open({
  // Required
  apiKey: string,         // Your API key from the Adhere dashboard
  clientId: string,       // UUID from your SDK Config (created in dashboard)

  // Optional
  environment: "production" | "sandbox",  // Default: "sandbox"
  timeout: number,                        // Request timeout in ms (default: 30000)

  // Callbacks
  onComplete: (result) => void,   // Verification submitted successfully
  onError: (error) => void,       // Unrecoverable error
  onClose: () => void,            // User closed the modal
});
```

### `onComplete` Result

```typescript
{
  entryId: 42,                    // Use this to track the verification
  status: "processing",           // Always "processing" — final result via webhook
  submittedAt: "2026-04-13T...",  // ISO timestamp
  verificationResult: {           // Only for NIN/BVN (instant verification)
    status: "verified",
    provider_result: { first_name: "Amara", last_name: "Okafor", ... }
  }
}
```

---

## Option 2: Headless (Custom UI)

For full control over the user interface, use the SDK's API methods directly.

### Initialize

```typescript
import SmartComply from "smartcomply-web-sdk";

const sdk = new SmartComply({
  apiKey: "pk_live_your_api_key",
  clientId: "your-sdk-config-uuid",
  environment: "production",
});
```

### Create Session

Every verification flow starts with a session. Sessions last 30 minutes.

```typescript
const session = await sdk.createSession();
// session.token — used internally (you don't need to store this)
// session.expires_at — ISO timestamp
```

### Load Configuration

Fetch your SDK config (brand name, theme, available ID types per country):

```typescript
const config = await sdk.initializeConfig();

console.log(config.brand_name);     // "Your Company Name"
console.log(config.channels);       // { "nigeria": ["nin"], "global": ["passport", "national_id"] }
console.log(config.verification_type); // ["data_verification", "document_verification"]
```

Use `config.channels` to build your own country/ID type selector.

### Verify Identity

**NIN or BVN (instant result):**

```typescript
const result = await sdk.onboarding.verify({
  onboarding_type: "nin",       // "nin" | "bvn"
  id_number: "12345678901",
  country: "NG",
});

if (result.status === "verified") {
  console.log(result.provider_result);
  // { first_name: "Amara", last_name: "Okafor", dob: "1990-03-15", ... }
}
```

**Document (passport, national_id, drivers_license):**

```typescript
await sdk.onboarding.verify({
  onboarding_type: "passport",
  country: "US",
});
// Returns { status: "pending" } — actual document is uploaded in the next step
```

### Liveness Check (with built-in camera UI)

Mount the SDK's liveness UI into any container element:

```typescript
const container = document.getElementById("liveness-container");

const result = await sdk.liveness.startCheck(container, {
  identifier: "12345678901",     // NIN/passport number
  identifier_type: "nin",
  country: "NG",
  id_file: documentBlob,         // Optional: Blob from document photo
}, ["BLINK", "TURN_LEFT", "OPEN_MOUTH"]);

console.log(result.status); // "processing"
```

The SDK handles camera access, face detection, action prompts, video recording, and submission.

### Liveness Check (fully manual)

If you want to handle camera and recording yourself:

```typescript
// 1. Create entry
const entry = await sdk.liveness.create({
  identifier: "A12345678",
  identifier_type: "passport",
  country: "US",
  challenge_actions: ["BLINK", "TURN_LEFT", "OPEN_MOUTH"],
  autoshot_file: selfieBlob,      // Your captured selfie (JPEG)
  id_file: passportPhotoBlob,     // Your captured document photo
});

// 2. Run your own camera/detection/recording UI
// ...

// 3. Submit the recorded video
const result = await sdk.liveness.submit(entry.id, videoBlob);
// result.status === "processing"
```

**After submission, the session is revoked.** Create a new session for additional verifications.

---

## Receiving Results (Webhook)

Verification is processed asynchronously (face matching with AI). Results are delivered via webhook to the URL configured in your SDK Config.

### Webhook Payload

```json
POST https://your-server.com/webhook/smartcomply
Content-Type: application/json
X-Adhere-Signature: <hmac-sha256-hex>

{
  "event": "liveness.completed",
  "data": {
    "entry_id": 42,
    "status": "passed",
    "is_verified": true,
    "match_score": 0.234,
    "document_verification": {
      "status": "verified",
      "document_type": "passport",
      "is_expired": false,
      "face_match_verified": true,
      "extracted_name": "AMARA OKAFOR",
      "extracted_expiry_date": "2030-06-15"
    }
  }
}
```

### Verify Signature

**Always verify the webhook signature** to prevent spoofing:

```javascript
const crypto = require("crypto");

app.post("/webhook/smartcomply", express.json(), (req, res) => {
  const signature = req.headers["x-adhere-signature"];
  const secret = process.env.WEBHOOK_SECRET.replace(/-/g, "");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );

  if (!isValid) return res.status(401).send("Bad signature");

  // Handle the event
  const { event, data } = req.body;

  if (event === "liveness.completed" && data.is_verified) {
    // ✓ User is verified — update your database
    markUserAsVerified(data.entry_id);
  }

  res.json({ received: true });
});
```

---

## Challenge Actions

| Action | What the user does |
|--------|-------------------|
| `BLINK` | Blink both eyes |
| `TURN_LEFT` | Turn head to the left |
| `TURN_RIGHT` | Turn head to the right |
| `TURN_HEAD` | Turn head in any direction |
| `OPEN_MOUTH` | Open mouth wide |

Actions must be **UPPERCASE**. We recommend using 3 actions: `["BLINK", "TURN_LEFT", "OPEN_MOUTH"]`.

---

## Error Handling

```typescript
import { SDKError, AuthError, NetworkError } from "smartcomply-web-sdk";

try {
  await sdk.createSession();
} catch (err) {
  if (err instanceof AuthError) {
    // 401: Invalid API key, expired session, or disabled branch
  } else if (err instanceof NetworkError) {
    // No internet, timeout, DNS failure
  } else if (err instanceof SDKError) {
    // Backend error: validation, insufficient balance, etc.
    console.log(err.statusCode);  // HTTP status
    console.log(err.errorCode);   // Machine-readable code
    console.log(err.errorData);   // Additional error details
  }
}
```

| Error Code | HTTP | Meaning |
|------------|------|---------|
| `INVALID_API_KEY` | 401 | Bad API key or expired session |
| `SDK_CONFIG_NOT_FOUND` | 404 | Invalid `clientId` |
| `VALIDATION_ERROR` | 400 | Missing or invalid fields |
| `INSUFFICIENT_BALANCE` | 402 | Top up your wallet |

---

## Theming

The widget automatically uses the theme from your SDK Config (set in the Adhere dashboard):

- `default` — Clean blue on white
- `midnight_blue` — Dark mode with blue accents
- `sunset_gold` — Warm gold on cream
- `forest_emerald` — Green on mint

No client-side theme configuration required.

---

## Browser Support

Requires camera access (`getUserMedia`), video recording (`MediaRecorder`), and WebAssembly.

| Browser | Version |
|---------|---------|
| Chrome | 80+ |
| Firefox | 75+ |
| Safari | 14+ |
| Edge | 80+ |

---

## Prerequisites

1. **Adhere account** — Sign up at the dashboard
2. **API Key** — Format: `pk_live_...` (from dashboard → API Keys)
3. **SDK Config** — Create in dashboard with your brand name, theme, verification types, channels, and webhook URL
4. **Client ID** — The UUID shown on your SDK Config
5. **Funded wallet** — Each verification deducts from your balance
6. **Webhook endpoint** — A URL on your server to receive verification results

---

## TypeScript Support

Full TypeScript definitions are included. Key types:

```typescript
import type {
  FlowOptions,
  FlowResult,
  SDKConfig,
  SDKInitConfig,
  SessionResponse,
  VerifyIdentityResponse,
  LivenessCreateResponse,
  LivenessSubmitResponse,
  ChallengeAction,
  LivenessWebhookPayload,
  ApiResponse,
} from "smartcomply-web-sdk";
```

---

## License

ISC
