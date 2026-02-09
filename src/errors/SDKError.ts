export class SDKError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "SDKError";
    this.statusCode = statusCode;
  }
}
