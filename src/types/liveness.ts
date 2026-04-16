/**
 * Backend-validated challenge actions. Only these 5 are accepted.
 */
export type ChallengeAction =
  | "BLINK"
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "TURN_HEAD"
  | "OPEN_MOUTH";

/**
 * Parameters for creating a liveness entry.
 * Sent as multipart to POST /v1/sdk/liveness/create
 */
export interface LivenessCreateRequest {
  identifier: string;
  identifier_type: string;
  country: string;
  challenge_actions: ChallengeAction[];
  autoshot_file: File | Blob;
  id_file?: File | Blob;
  snapshot_file?: File | Blob;
}

/**
 * Response from POST /v1/sdk/liveness/create (unwrapped).
 */
export interface LivenessCreateResponse {
  id: number;
  client_id: string;
  challenge_actions: ChallengeAction[];
  expires_at: string | null;
  status: "pending";
}

/**
 * Response from POST /v1/sdk/liveness/submit/ (unwrapped).
 */
export interface LivenessSubmitResponse {
  id: number;
  status: "processing";
  submitted_at: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Webhook payload shape for liveness.completed event.
 * This is what the backend POSTs to the client's webhook_url.
 */
export interface LivenessWebhookPayload {
  event: "liveness.completed";
  data: {
    entry_id: number;
    status: string;
    is_verified: boolean;
    match_score: number | null;
    metadata: Record<string, unknown>;
    document_verification?: {
      status: string;
      document_type: string;
      is_expired: boolean;
      face_match_verified: boolean;
      face_match_score: number | null;
      extracted_name: string;
      extracted_expiry_date: string | null;
    };
  };
}
