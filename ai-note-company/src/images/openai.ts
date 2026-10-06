import fs from "node:fs";
import path from "node:path";
import type { GeneratedImage, ImageProvider, ImageRequest } from "./imageProvider";

/** OpenAI Images API (gpt-image-1). Enabled with IMAGE_PROVIDER=openai + IMAGE_API_KEY. */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai";
  constructor(private readonly apiKey: string, private readonly model = "gpt-image-1") {
    if (!apiKey) throw new Error("IMAGE_API_KEY is required for IMAGE_PROVIDER=openai");
  }

  async generate(req: ImageRequest): Promise<GeneratedImage> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, prompt: req.prompt, size: "1536x1024", n: 1 }),
    });
    if (!res.ok) throw new Error(`image API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("image API returned no image");
    fs.mkdirSync(path.dirname(req.outPathBase), { recursive: true });
    const out = `${req.outPathBase}.png`;
    fs.writeFileSync(out, Buffer.from(b64, "base64"));
    return { path: out, mimeType: "image/png", provider: this.name, isPlaceholder: false };
  }
}
