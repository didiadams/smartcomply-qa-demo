import { HttpClient } from "../../client/HttpClient";
import {
  OnboardingType,
  VerifyIdentityRequest,
  VerifyIdentityResponse,
} from "../../types/onboarding";

/**
 * Onboarding module — identity verification.
 *
 * All methods use session-token auth (x-access-token header).
 */
export class OnboardingModule {
  constructor(private http: HttpClient) {}

  /**
   * Verify a user's identity.
   *
   * POST /v1/sdk/onboarding/verify/
   * Auth: x-access-token: <sessionToken>
   *
   * For NIN/BVN (data verification):
   *   { onboarding_type: "nin", id_number: "12345678901", country: "NG" }
   *
   * For documents (passport, national_id, drivers_license):
   *   { onboarding_type: "passport", country: "US" }
   *   (document image is uploaded during liveness creation)
   */
  async verify(params: VerifyIdentityRequest): Promise<VerifyIdentityResponse> {
    const body: Record<string, unknown> = {
      onboarding_type: params.onboarding_type,
      country: params.country,
    };

    if (params.id_number) {
      body.id_number = params.id_number;
    }

    return this.http.sessionRequest<VerifyIdentityResponse>(
      "POST",
      "/v1/sdk/onboarding/verify/",
      body
    );
  }
}
