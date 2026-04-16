import { SDKError } from "./SDKError";

/**
 * Thrown when authentication fails (invalid API key, expired session, etc).
 */
export class AuthError extends SDKError {
  constructor(message: string, errorCode?: string) {
    super(message, 401, errorCode);
    this.name = "AuthError";
  }
}
