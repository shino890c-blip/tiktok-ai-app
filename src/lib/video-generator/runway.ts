import { MockVideoGenerator } from "./mock";
import type {
  GeneratePromptsInput,
  GeneratePromptsResult,
  GenerateVoiceInput,
  GenerateVoiceResult,
  VideoGenerator,
} from "./types";

/**
 * 将来の Runway API 切替用スタブ実装。
 *
 * 現時点では Runway 側の映像生成・音声生成APIは呼び出さず、
 * インターフェースの形だけを提供する。実装時は以下を行う想定:
 *   1. RUNWAY_API_KEY を環境変数から取得
 *   2. Runway の Gen-3/Gen-4 系 API にプロンプトを送信し、動画/画像を生成
 *   3. 生成結果を public/generated/ 以下に保存し、URLを返す
 *
 * VIDEO_GENERATOR_PROVIDER=runway に設定すると本実装が選択されるが、
 * 実処理は未実装のため、現状はモック実装にフォールバックする。
 */
export class RunwayVideoGenerator implements VideoGenerator {
  readonly providerName = "runway";

  private readonly apiKey: string | undefined;
  private readonly fallback = new MockVideoGenerator();

  constructor() {
    this.apiKey = process.env.RUNWAY_API_KEY;
  }

  async generatePrompts(input: GeneratePromptsInput): Promise<GeneratePromptsResult> {
    // TODO: Runway API 実装後にここで実際のプロンプト生成/最適化を行う
    return this.fallback.generatePrompts(input);
  }

  async generateVoice(input: GenerateVoiceInput): Promise<GenerateVoiceResult> {
    // TODO: Runway (または連携するTTSサービス) 実装後にここで音声生成を行う
    return this.fallback.generateVoice(input);
  }
}
