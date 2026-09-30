/** An error that maps directly to an HTTP response (`{ error: "<message>" }`). */
export class HttpError extends Error {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly extra?: Record<string, unknown>;
  constructor(status: number, message: string, opts: { headers?: Record<string, string>; extra?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.headers = opts.headers;
    this.extra = opts.extra;
  }
}
