export type Environment = "sandbox" | "production";

export const BASE_URLS: Record<Environment, string> = {
  sandbox: "http://localhost:8000",
  production: "https://api.smartcomply.com"
};

export interface SDKConfig {
  apiKey: string;
  environment?: Environment;
  timeout?: number;
}

