import { SDKConfig, BASE_URLS } from "./Config";
import { SDKError } from "../errors/SDKError";
import { AuthError } from "../errors/AuthError";
import { NetworkError } from "../errors/NetworkError";
import { ApiResponse } from "../types/common";

/**
 * HTTP client aligned with Adhere backend contract.
 *
 * Two auth modes:
 *  - request()         → Authorization: Bearer <apiKey>        (session creation)
 *  - sessionRequest()  → x-access-token: <sessionToken>        (all other endpoints)
 *  - uploadWithSession() → multipart + x-access-token          (file uploads)
 */
export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private sessionToken: string | null = null;

  constructor(config: SDKConfig) {
    this.baseUrl = BASE_URLS[config.environment || "sandbox"];
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  /**
   * API-key authenticated request (used for session creation only).
   * Header: Authorization: Bearer <apiKey>
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return this._fetch<T>(path, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Session-token authenticated request (used for all endpoints after session creation).
   * Header: x-access-token: <sessionToken>
   */
  async sessionRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    this.requireToken();

    return this._fetch<T>(path, {
      method,
      headers: {
        "x-access-token": this.sessionToken!,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Multipart file upload with session-token auth.
   * Header: x-access-token: <sessionToken>
   * NOTE: Do NOT set Content-Type — browser sets it with boundary automatically.
   */
  async uploadWithSession<T>(path: string, formData: FormData): Promise<T> {
    this.requireToken();

    return this._fetch<T>(path, {
      method: "POST",
      headers: {
        "x-access-token": this.sessionToken!,
      },
      body: formData,
    });
  }

  /**
   * Legacy upload with API key (kept for backward compatibility if needed).
   */
  async upload<T>(path: string, formData: FormData): Promise<T> {
    return this._fetch<T>(path, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: formData,
    });
  }

  // ---- Internal ----

  private requireToken(): void {
    if (!this.sessionToken) {
      throw new AuthError(
        "No session token set. Call sdk.createSession() first.",
        "NO_SESSION_TOKEN"
      );
    }
  }

  private async _fetch<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new SDKError(
          `Unexpected response from ${path} (${response.status})`,
          response.status
        );
      }

      // Parse the backend's standard response envelope
      const envelope: ApiResponse = await response.json();

      if (!response.ok || envelope.status === "error") {
        const statusCode = response.status;

        // Map specific HTTP statuses to error types
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthError(
            envelope.message || "Authentication failed",
            envelope.code
          );
        }

        throw new SDKError(
          envelope.message || `Request to ${path} failed`,
          statusCode,
          envelope.code,
          envelope.data as Record<string, unknown>
        );
      }

      // Return the unwrapped data from the envelope
      return envelope.data as T;

    } catch (err: any) {
      if (err instanceof SDKError) throw err;

      if (err.name === "AbortError") {
        throw new NetworkError("Request timeout");
      }
      if (err.name === "TypeError" && err.message?.includes("fetch")) {
        throw new NetworkError(`Network error: ${err.message}`);
      }

      throw new SDKError(
        err.message || "Unknown error",
        0,
        "UNKNOWN_ERROR"
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
