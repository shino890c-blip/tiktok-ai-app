import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ConfigError, ExternalApiError, NonRetryableError } from "../core/errors.js";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
  scope?: string;
  token_type?: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenPath: string;
}

/** Minimal Google OAuth2 client (authorization code + refresh token). Tokens live in token.json (gitignored). */
export class GoogleOAuthClient {
  private token: StoredToken | null = null;

  constructor(
    private readonly cfg: OAuthClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  buildAuthUrl(state = randomBytes(16).toString("hex")): { url: string; state: string } {
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      response_type: "code",
      scope: YOUTUBE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state };
  }

  async exchangeCode(code: string): Promise<StoredToken> {
    const token = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.cfg.redirectUri,
    });
    this.save(token);
    return token;
  }

  async getAccessToken(): Promise<string> {
    const token = this.token ?? this.load();
    if (token.expiry_date - 60_000 > Date.now()) return token.access_token;
    if (!token.refresh_token) {
      throw new NonRetryableError("YouTube access token expired and no refresh_token stored. Run `npm run youtube:auth`.", "OAUTH_EXPIRED");
    }
    const refreshed = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: token.refresh_token });
    this.save({ ...refreshed, refresh_token: refreshed.refresh_token ?? token.refresh_token });
    return this.token!.access_token;
  }

  hasToken(): boolean {
    return existsSync(this.cfg.tokenPath);
  }

  private load(): StoredToken {
    if (!existsSync(this.cfg.tokenPath)) {
      throw new ConfigError(`No OAuth token at ${this.cfg.tokenPath}. Run \`npm run youtube:auth\` first.`);
    }
    this.token = JSON.parse(readFileSync(this.cfg.tokenPath, "utf8")) as StoredToken;
    return this.token;
  }

  private save(token: StoredToken): void {
    this.token = token;
    writeFileSync(this.cfg.tokenPath, JSON.stringify(token, null, 2), { mode: 0o600 });
    try {
      chmodSync(this.cfg.tokenPath, 0o600);
    } catch {
      /* best effort on non-POSIX filesystems */
    }
  }

  private async tokenRequest(params: Record<string, string>): Promise<StoredToken> {
    const res = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, ...params }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ExternalApiError(`OAuth token request failed (${res.status}): ${String(body.error ?? "")}`, res.status, res.status >= 500);
    }
    return {
      access_token: String(body.access_token),
      refresh_token: body.refresh_token ? String(body.refresh_token) : undefined,
      expiry_date: Date.now() + Number(body.expires_in ?? 3600) * 1000,
      scope: body.scope ? String(body.scope) : undefined,
      token_type: body.token_type ? String(body.token_type) : undefined,
    };
  }
}
