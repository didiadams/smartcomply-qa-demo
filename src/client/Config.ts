export type Environment = "sandbox" | "production";

export const BASE_URLS: Record<Environment, string> = {
  sandbox: "http://localhost:8000",
  production: "https://adhere-api.smartcomply.com"
};

export interface SDKConfig {
  apiKey: string;
  clientId: string;          // Required UUID — used for session creation
  environment?: Environment;
  timeout?: number;
}
