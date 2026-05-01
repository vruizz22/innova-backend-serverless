import { Injectable } from '@nestjs/common';
import { ClaudeVisionAdapter } from '@adapters/math-ocr/claude-vision.adapter';
import { GeminiVisionAdapter } from '@adapters/math-ocr/gemini-vision.adapter';
import { MathOCRPort, MathOCRResult } from '@adapters/math-ocr/math-ocr.port';

@Injectable()
export class MathOCROrchestrator {
  private readonly gemini: MathOCRPort;
  private readonly claude: MathOCRPort;

  constructor(
    geminiAdapter: GeminiVisionAdapter,
    claudeAdapter: ClaudeVisionAdapter,
  ) {
    this.gemini = geminiAdapter;
    this.claude = claudeAdapter;
  }

  async extract(imageUrl: string): Promise<MathOCRResult> {
    const primary = await this.gemini.extract(imageUrl);
    if (primary.confidence >= 0.85) {
      return primary;
    }
    const fallback = await this.claude.extract(imageUrl);
    return fallback.confidence > primary.confidence ? fallback : primary;
  }
}
