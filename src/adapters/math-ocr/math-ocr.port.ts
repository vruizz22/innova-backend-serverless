import { AttemptStepDto } from '@modules/attempts/dto/create-attempt.dto';

export interface MathOCRResult {
  extractedText: string;
  confidence: number;
  rawSteps: AttemptStepDto[];
  topicHint: string | null;
  finalAnswer: string;
}

export interface MathOCRPort {
  extract(imageBytes: Buffer): Promise<MathOCRResult>;
}
