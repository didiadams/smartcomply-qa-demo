import { SmartComply } from "./client/Smartcomply";

export default SmartComply;
export { SmartComply };
export type {
  OnboardingType,
  VerifyIdentityRequest,
  VerifyIdentityResponse,
  OnboardingSession,
  SessionResponse,
} from "./types/onboarding";
export type {
  LivenessChallengeResponse,
  LivenessVerifyResponse,
} from "./types/liveness";
export type { SDKConfig, Environment } from "./client/Config";
