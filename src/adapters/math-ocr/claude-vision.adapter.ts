import { Injectable } from '@nestjs/common';
import { MathOCRPort, MathOCRResult } from '@adapters/math-ocr/math-ocr.port';

@Injectable()
export class ClaudeVisionAdapter implements MathOCRPort {
  extract(_imageBytes: Buffer): Promise<MathOCRResult> {
    throw new Error('Claude OCR not enabled for MVP');
  }
}
