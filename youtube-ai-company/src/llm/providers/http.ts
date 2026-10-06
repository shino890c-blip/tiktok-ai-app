import { ExternalApiError, TimeoutError } from "../../core/errors.js";

/** POST JSON with timeout; maps HTTP failures to retryable/non-retryable errors. */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError" || (err as Error).name === "AbortError") {
      throw new TimeoutError(`Request to ${new URL(url).host} timed out after ${timeoutMs}ms`);
    }
    throw new ExternalApiError(`Network error calling ${new URL(url).host}: ${(err as Error).message}`, undefined, true);
  }
  const text = await res.text();
  if (!res.ok) {
    const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
    // Response bodies may echo request details but never our API key; still truncate.
    throw new ExternalApiError(`HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 300)}`, res.status, retryable);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExternalApiError(`Invalid JSON from ${new URL(url).host}`, res.status, true);
  }
}
