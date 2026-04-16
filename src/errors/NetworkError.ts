import { SDKError } from "./SDKError";

/**
 * Thrown when a network request fails (timeout, no connection, DNS failure, etc).
 */
export class NetworkError extends SDKError {
  constructor(message: string) {
    super(message, 0, "NETWORK_ERROR");
    this.name = "NetworkError";
  }
}
