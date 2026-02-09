import { HttpClient } from "../../client/HttpClient";
import {
  OnboardingType,
  VerifyIdentityResponse,
  OnboardingSession,
  OnboardingResult,
} from "../../types/onboarding";

export class OnboardingModule {
  private sessionId: string | null = null;

  constructor(private http: HttpClient) {}

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  private requireSession(): string {
    if (!this.sessionId) {
      throw new Error(
        "No active session. Call sdk.createSession() before using onboarding methods."
      );
    }
    return this.sessionId;
  }

  async verify(params: {
    onboarding_type: OnboardingType;
    id_number: string;
    name_to_confirm: string;
  }): Promise<VerifyIdentityResponse> {
    const sessionId = this.requireSession();

    return this.http.request<VerifyIdentityResponse>(
      "POST",
      "/v1/onboarding/verify",
      {
        session_id: sessionId,
        onboarding_type: params.onboarding_type,
        id_number: params.id_number,
        name_to_confirm: params.name_to_confirm,
      }
    );
  }

  async status(): Promise<OnboardingSession> {
    const sessionId = this.requireSession();

    return this.http.request<OnboardingSession>(
      "GET",
      `/v1/onboarding/status/${sessionId}`
    );
  }

  async result(): Promise<OnboardingResult> {
    const sessionId = this.requireSession();

    return this.http.request<OnboardingResult>(
      "GET",
      `/v1/onboarding/result/${sessionId}`
    );
  }
}
