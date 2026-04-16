import { SDKConfig } from "./Config";
import { HttpClient } from "./HttpClient";
import { OnboardingModule } from "../modules/onboarding/onboarding";
import { LivenessModule } from "../modules/liveness/liveness";
import {
  SessionResponse,
  SDKInitConfig,
} from "../types/onboarding";

/**
 * SmartComply SDK — main entry point.
 *
 * Usage:
 *   const sdk = new SmartComply({ apiKey: "pk_...", clientId: "uuid-...", environment: "sandbox" });
 *   const session = await sdk.createSession();
 *   const config = await sdk.initializeConfig();
 *   // ... use sdk.onboarding and sdk.liveness modules
 */
export class SmartComply {
  private http: HttpClient;
  private clientId: string;
  private _sessionToken: string | null = null;
  private _sessionExpiresAt: string | null = null;
  private _sdkConfig: SDKInitConfig | null = null;

  public onboarding: OnboardingModule;
  public liveness: LivenessModule;

  constructor(config: SDKConfig) {
    if (!config.apiKey) {
      throw new Error("SmartComply: apiKey is required");
    }
    if (!config.clientId) {
      throw new Error("SmartComply: clientId is required (UUID from your SDK config)");
    }

    this.clientId = config.clientId;
    this.http = new HttpClient(config);

    this.onboarding = new OnboardingModule(this.http);
    this.liveness = new LivenessModule(this.http);
  }

  /** Current session token (null if not created yet) */
  get sessionToken(): string | null {
    return this._sessionToken;
  }

  /** Session expiration ISO timestamp */
  get sessionExpiresAt(): string | null {
    return this._sessionExpiresAt;
  }

  /** SDK config fetched from backend (null until initializeConfig() is called) */
  get sdkConfig(): SDKInitConfig | null {
    return this._sdkConfig;
  }

  /**
   * Create a new SDK session.
   *
   * POST /v1/sdk/session/create/
   * Auth: Authorization: Bearer <apiKey>
   * Body: { client_id: "<uuid>" }
   *
   * Returns: { token: "...", expires_at: "..." }
   */
  async createSession(): Promise<SessionResponse> {
    const response = await this.http.request<SessionResponse>(
      "POST",
      "/v1/sdk/session/create/",
      { client_id: this.clientId }
    );

    this._sessionToken = response.token;
    this._sessionExpiresAt = response.expires_at;

    // Set the session token on the HTTP client for subsequent requests
    this.http.setSessionToken(response.token);

    return response;
  }

  /**
   * Fetch SDK configuration from the backend.
   * Must be called after createSession().
   *
   * GET /v1/sdk/sdk/initialize/
   * Auth: x-access-token: <sessionToken>
   *
   * Returns: { brand_name, theme, verification_type, channels, redirect_url, ... }
   */
  async initializeConfig(): Promise<SDKInitConfig> {
    const config = await this.http.sessionRequest<SDKInitConfig>(
      "GET",
      "/v1/sdk/sdk/initialize/"
    );

    this._sdkConfig = config;
    return config;
  }
}
