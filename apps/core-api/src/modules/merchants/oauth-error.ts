export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "server_error"
  | "temporarily_unavailable";

export class OAuthProtocolError extends Error {
  constructor(
    public code: OAuthErrorCode,
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
