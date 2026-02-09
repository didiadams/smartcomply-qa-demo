import { SDKConfig, BASE_URLS } from "./Config";
import { SDKError } from "../errors/SDKError";

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: SDKConfig) {
    this.baseUrl = BASE_URLS[config.environment || "sandbox"];
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 15000;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      this.timeout
    );

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new SDKError(
          `Unexpected response from ${path} (${response.status})`,
          response.status
        );
      }

      const data = await response.json();

      if (!response.ok) {
        const msg = data.detail || data.message || data.error || JSON.stringify(data);
        throw new SDKError(`${path} failed: ${msg}`, response.status);
      }

      return data as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new SDKError("Request timeout", 408);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      this.timeout
    );

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new SDKError(
          `Unexpected response from upload (${response.status})`,
          response.status
        );
      }

      const data = await response.json();

      if (!response.ok) {
        const msg = data.detail || data.message || data.error || JSON.stringify(data);
        throw new SDKError(`Upload failed: ${msg}`, response.status);
      }

      return data as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new SDKError("Upload timeout", 408);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
