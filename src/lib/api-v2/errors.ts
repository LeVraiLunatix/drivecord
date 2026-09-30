/**
 * Error model for `/api/v2`. Every failure is `{ error: { code, message, requestId } }`:
 * `code` is stable and meant for programs, `message` is human-readable (French).
 */
export type ApiErrorCode =
  | "unauthorized"
  | "key_expired"
  | "ip_not_allowed"
  | "insufficient_scope"
  | "rate_limited"
  | "invalid_request"
  | "invalid_json"
  | "invalid_cursor"
  | "unknown_field"
  | "unsupported_media_type"
  | "payload_too_large"
  | "not_found"
  | "conflict"
  | "parent_not_found"
  | "parent_trashed"
  | "cycle"
  | "max_depth"
  | "locked_items"
  | "file_too_large"
  | "upstream_error"
  | "internal_error";

export class ApiError extends Error {
  // Explicit fields (not parameter properties): `node --test` runs this file
  // in type-strip-only mode, which doesn't support that TypeScript syntax.
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly headers?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    headers?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.details = details;
  }
}

export const badRequest = (message: string, code: ApiErrorCode = "invalid_request") =>
  new ApiError(400, code, message);

export const notFound = (what: "Fichier" | "Dossier" | "Lien") =>
  new ApiError(404, "not_found", `${what} introuvable.`);

export const conflict = (code: ApiErrorCode, message: string) => new ApiError(409, code, message);
