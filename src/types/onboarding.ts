export type OnboardingType =
  | "bvn"
  | "nin"
  | "drivers_license"
  | "voters_card"
  | "passport";

export interface SessionResponse {
  token: string;
}

export interface VerifyIdentityRequest {
  session_id: string;
  onboarding_type: OnboardingType;
  id_number: string;
  name_to_confirm: string;
}

export interface NameMatch {
  name_matched: boolean;
  confidence: number;
}

export interface VerifyIdentityResponse {
  session_id: string;
  status: "verified" | "failed";
  match: NameMatch;
}

export interface OnboardingSession {
  session_id: string;
  status: "created" | "pending" | "verified" | "completed" | "failed";
}

export interface OnboardingResult {
  session_id: string;
  status: string;
  verified: boolean;
}
