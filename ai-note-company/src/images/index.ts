import type { AppConfig } from "../config";
import type { ImageProvider } from "./imageProvider";
import { OpenAiImageProvider } from "./openai";
import { PlaceholderImageProvider } from "./placeholder";

export * from "./imageProvider";
export { PlaceholderImageProvider } from "./placeholder";

/** Falls back to placeholders when no API is configured. */
export function createImageProvider(config: AppConfig): ImageProvider {
  if (config.image.provider === "openai" && config.image.apiKey && config.runMode === "live") {
    return new OpenAiImageProvider(config.image.apiKey);
  }
  return new PlaceholderImageProvider();
}
