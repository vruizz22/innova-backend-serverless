import { Injectable } from '@nestjs/common';
import { MathOCRPort, MathOCRResult } from '@adapters/math-ocr/math-ocr.port';

@Injectable()
export class ClaudeVisionAdapter implements MathOCRPort {
  extract(imageUrl: string): Promise<MathOCRResult> {
    void imageUrl;
    return Promise.resolve({
      extractedText: '53 - 26 = 27',
      confidence: 0.9,
      rawSteps: ['53 - 26', '27'],
    });
  }
}
