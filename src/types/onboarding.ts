/**
 * Supported identity verification types.
 * - "nin" / "bvn": Data verification (Nigeria-only, requires id_number)
 * - "passport" / "national_id" / "drivers_license": Document verification (global)
 */
export type OnboardingType =
  | "nin"
  | "bvn"
  | "passport"
  | "national_id"
  | "drivers_license";

/**
 * Request payload for POST /v1/sdk/onboarding/verify/
 * - id_number is required only for data verification (NIN/BVN)
 * - country defaults to "NG" on backend
 */
export interface VerifyIdentityRequest {
  onboarding_type: OnboardingType;
  id_number?: string;
  country: string;
}

/**
 * Unwrapped data from the onboarding verify response.
 */
export interface VerifyIdentityResponse {
  status: "verified" | "pending" | "failed";
  onboarding_type: string;
  verified_at?: string;
  country?: string;
  message?: string;
  provider_result?: Record<string, unknown>;
}

/**
 * Session creation response (unwrapped from envelope).
 */
export interface SessionResponse {
  token: string;
  expires_at: string;
}

/**
 * SDK configuration returned by GET /v1/sdk/initialize/
 */
export interface SDKInitConfig {
  id: number;
  brand_name: string;
  description: string;
  theme: string;
  verification_type: string[];
  redirect_url: string | null;
  channels: Record<string, string[]>;
}
