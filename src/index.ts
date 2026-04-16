import { SmartComply } from "./client/Smartcomply";
import { SmartComplyFlow } from "./flow/SmartComplyFlow";

export default SmartComply;
export { SmartComply, SmartComplyFlow };

// Config
export type { SDKConfig, Environment } from "./client/Config";

// Flow types
export type { FlowOptions, FlowResult } from "./flow/SmartComplyFlow";

// Onboarding types
export type {
  OnboardingType,
  VerifyIdentityRequest,
  VerifyIdentityResponse,
  SessionResponse,
  SDKInitConfig,
} from "./types/onboarding";

// Liveness types
export type {
  ChallengeAction,
  LivenessCreateRequest,
  LivenessCreateResponse,
  LivenessSubmitResponse,
  LivenessWebhookPayload,
} from "./types/liveness";

// Response envelope types
export type {
  ApiResponse,
  FieldError,
  ErrorData,
} from "./types/common";

// Error classes
export { SDKError } from "./errors/SDKError";
export { AuthError } from "./errors/AuthError";
export { NetworkError } from "./errors/NetworkError";
