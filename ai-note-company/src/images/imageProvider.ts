export interface ImageRequest {
  kind: "cover" | "body";
  title: string;
  prompt: string;
  /** Output path without extension; providers choose the extension. */
  outPathBase: string;
  width: number;
  height: number;
}

export interface GeneratedImage {
  path: string;
  mimeType: string;
  provider: string;
  isPlaceholder: boolean;
}

/** Abstraction over image generation backends. */
export interface ImageProvider {
  readonly name: string;
  generate(req: ImageRequest): Promise<GeneratedImage>;
}
