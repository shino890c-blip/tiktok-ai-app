import { writeFile } from "node:fs/promises";
import type { AppConfig } from "../config/index.js";
import { ExternalApiError, NonRetryableError, TimeoutError } from "../core/errors.js";

/** Text-to-speech backend. Writes a WAV file for one narration line. */
export interface TTSProvider {
  readonly name: string;
  /** Credit / disclosure line appended to the video description (license or AI-voice disclosure). */
  readonly credit: string | null;
  /** Returns false when the provider produces no audio (silent mock). */
  readonly producesAudio: boolean;
  synthesize(text: string, outWav: string): Promise<void>;
}

export class SilentTTS implements TTSProvider {
  readonly name = "silent";
  readonly credit = null;
  readonly producesAudio = false;
  async synthesize(): Promise<void> {
    /* the renderer generates silence of the scene length */
  }
}

async function fetchOrThrow(url: string, init: RequestInit, label: string, timeoutMs = 120_000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") throw new TimeoutError(`${label} timed out`);
    throw new ExternalApiError(`${label} unreachable (${(err as Error).message}). Is it running?`, undefined, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ExternalApiError(`${label} HTTP ${res.status}: ${body.slice(0, 200)}`, res.status, res.status >= 500 || res.status === 429);
  }
  return res;
}

/** VOICEVOX engine (free, Japanese). https://voicevox.hiroshiba.jp — credit line is required by its terms. */
export class VoicevoxTTS implements TTSProvider {
  readonly name = "voicevox";
  readonly producesAudio = true;
  constructor(
    private readonly url: string,
    private readonly speaker: number,
    private readonly speed: number,
    readonly credit: string,
  ) {}

  async synthesize(text: string, outWav: string): Promise<void> {
    const base = this.url.replace(/\/$/, "");
    const q = await fetchOrThrow(`${base}/audio_query?${new URLSearchParams({ text, speaker: String(this.speaker) })}`, { method: "POST" }, "VOICEVOX");
    const query = (await q.json()) as Record<string, unknown>;
    query.speedScale = this.speed;
    const wav = await fetchOrThrow(
      `${base}/synthesis?${new URLSearchParams({ speaker: String(this.speaker) })}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(query) },
      "VOICEVOX",
    );
    await writeFile(outWav, Buffer.from(await wav.arrayBuffer()));
  }

  async healthCheck(): Promise<string> {
    const res = await fetchOrThrow(`${this.url.replace(/\/$/, "")}/version`, {}, "VOICEVOX", 5_000);
    return (await res.text()).replace(/"/g, "");
  }
}

/** OpenAI-compatible speech API. Discloses that the voice is AI-generated. */
export class OpenAITTS implements TTSProvider {
  readonly name = "openai";
  readonly producesAudio = true;
  readonly credit = "※ナレーションはAI音声です";
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly voice: string,
  ) {}

  async synthesize(text: string, outWav: string): Promise<void> {
    const res = await fetchOrThrow(
      `${this.baseUrl.replace(/\/$/, "")}/audio/speech`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, voice: this.voice, input: text, response_format: "wav" }),
      },
      "OpenAI TTS",
    );
    await writeFile(outWav, Buffer.from(await res.arrayBuffer()));
  }
}

export function createTTS(config: AppConfig): TTSProvider {
  const t = config.video.tts;
  switch (t.provider) {
    case "silent":
      return new SilentTTS();
    case "voicevox":
      return new VoicevoxTTS(t.voicevoxUrl, t.voicevoxSpeaker, t.voicevoxSpeed, t.voicevoxCredit);
    case "openai":
      if (!config.llm.openaiApiKey) throw new NonRetryableError("OPENAI_API_KEY required for TTS_PROVIDER=openai", "CONFIG");
      return new OpenAITTS(config.llm.openaiApiKey, config.llm.openaiBaseUrl, t.openaiModel, t.openaiVoice);
  }
}
