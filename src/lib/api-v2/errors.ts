/**
 * Error model for `/api/v2`. Every failure is `{ error: { code, message, requestId } }`:
 * `code` is stable and meant for programs, `message` is human-readable (French).
 */
export type ApiErrorCode =
  | "unauthorized"
  | "token_expired"
  | "insufficient_scope"
  | "origin_not_allowed"
  | "rate_limited"
  | "invalid_request"
  | "invalid_json"
  | "invalid_cursor"
  | "unknown_field"
  | "unsupported_media_type"
  | "payload_too_large"
  | "not_found"
  | "file_not_found"
  | "folder_not_found"
  | "upload_not_found"
  | "share_not_found"
  | "parent_not_found"
  | "parent_trashed"
  | "conflict"
  | "upload_expired"
  | "upload_incomplete"
  | "chunk_mismatch"
  | "quota_exceeded"
  | "idempotency_key_reuse"
  | "idempotency_in_progress"
  | "unsupported_operation"
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

export const notFound = (what: "Fichier" | "Dossier" | "Lien" | "Upload") =>
  new ApiError(
    404,
    what === "Fichier" ? "file_not_found" : what === "Dossier" ? "folder_not_found" : what === "Upload" ? "upload_not_found" : "share_not_found",
    `${what} introuvable.`,
  );

export const conflict = (code: ApiErrorCode, message: string) => new ApiError(409, code, message);
