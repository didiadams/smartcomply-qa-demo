import { SDKConfig } from "./Config";
import { HttpClient } from "./HttpClient";
import { OnboardingModule } from "../modules/onboarding/onboarding";
import { LivenessModule } from "../modules/liveness/liveness";
import {
  SessionResponse,
  OnboardingType,
  VerifyIdentityResponse,
} from "../types/onboarding";

export class SmartComply {
  private http: HttpClient;
  private apiKey: string;
  private _sessionId: string | null = null;

  public onboarding: OnboardingModule;
  public liveness: LivenessModule;

  constructor(config: SDKConfig) {
    if (!config.apiKey) {
      throw new Error("SmartComply: apiKey is required");
    }

    this.apiKey = config.apiKey;
    this.http = new HttpClient(config);

    this.onboarding = new OnboardingModule(this.http);
    this.liveness = new LivenessModule(this.http);
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  async createSession(): Promise<SessionResponse> {
    const response = await this.http.request<SessionResponse>(
      "POST",
      "/v1/session/create",
      { api_key: this.apiKey }
    );

    this._sessionId = response.token;

    this.onboarding.setSessionId(response.token);
    this.liveness.setSessionId(response.token);

    return response;
  }

  async startOnboarding(params: {
    onboarding_type: OnboardingType;
    id_number: string;
    name_to_confirm: string;
  }): Promise<VerifyIdentityResponse> {
    if (!this._sessionId) {
      await this.createSession();
    }

    return this.onboarding.verify(params);
  }
}
