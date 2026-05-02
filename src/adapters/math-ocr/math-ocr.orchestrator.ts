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

  async extract(imageBytes: Buffer): Promise<MathOCRResult> {
    const primary = await this.gemini.extract(imageBytes);
    if (primary.confidence >= 0.85) {
      return primary;
    }
    try {
      const fallback = await this.claude.extract(imageBytes);
      return fallback.confidence > primary.confidence ? fallback : primary;
    } catch {
      // Claude OCR not enabled for MVP — return primary result regardless
      return primary;
    }
  }
}
