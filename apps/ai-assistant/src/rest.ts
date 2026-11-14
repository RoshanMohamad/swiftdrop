/**
 * Read-only client for the SwiftDrop REST API. Every call is a GET and carries the caller's own
 * JWT, so the assistant can never see more than the signed-in user (claude.md, AI assistant).
 */
export class RestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class SwiftDropApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 5000,
  ) {}

  /** GET only: there is deliberately no way to send any other method through this client. */
  async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
    bearer?: string,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as {
          detail?: string;
          title?: string;
        };
        detail = body.detail ?? body.title ?? "";
      } catch {
        /* non-JSON error body */
      }
      throw new RestError(
        response.status,
        detail || `Request failed (${response.status}).`,
      );
    }
    return (await response.json()) as T;
  }
}
