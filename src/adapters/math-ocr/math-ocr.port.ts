export interface MathOCRResult {
  extractedText: string;
  confidence: number;
  rawSteps: string[];
}

export interface MathOCRPort {
  extract(imageUrl: string): Promise<MathOCRResult>;
}
