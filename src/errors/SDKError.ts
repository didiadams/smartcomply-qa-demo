export class SDKError extends Error {
  statusCode: number;
  errorCode?: string;
  errorData?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    errorCode?: string,
    errorData?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SDKError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errorData = errorData;
  }
}
