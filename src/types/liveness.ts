export interface LivenessChallengeResponse {
  challenge_id: string;
  actions: string[];
  instruction: string;
  time_limit_seconds: number;
  expires_at: string;
}

export interface LivenessVerifyResponse {
  status: "verified" | "failed";
  verification_score?: number;
  detected_actions?: string[];
  actions_matched?: boolean;
  verified_at?: string;
  reason?: string;
  expected_actions?: string[];
  can_retry?: boolean;
}
