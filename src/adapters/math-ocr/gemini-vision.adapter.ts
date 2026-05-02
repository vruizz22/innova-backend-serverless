import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MathOCRPort, MathOCRResult } from '@adapters/math-ocr/math-ocr.port';
import { AttemptStepDto } from '@modules/attempts/dto/create-attempt.dto';

interface GeminiOcrResponse {
  latex_steps: string[];
  final_answer: string;
  overall_confidence: number;
  topic_hint: string | null;
}

const SYSTEM_PROMPT = `You are an expert transcriber of Chilean elementary school (grades 3-6) handwritten math.
Extract the student's step-by-step solution from this image.
Return a JSON object with fields:
  - latex_steps: array of strings (each mathematical step)
  - final_answer: string
  - overall_confidence: number 0-1
  - topic_hint: string or null (e.g. "subtraction_borrow")`;

@Injectable()
export class GeminiVisionAdapter implements MathOCRPort {
  private readonly client: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env['GEMINI_API_KEY'] ?? '';
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async extract(imageBytes: Buffer): Promise<MathOCRResult> {
    const model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg' as const,
        data: imageBytes.toString('base64'),
      },
    };

    const result = await model.generateContent([SYSTEM_PROMPT, imagePart]);
    const text = result.response.text();

    // Strip markdown code fences if present
    const jsonText = text.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(jsonText) as GeminiOcrResponse;

    const steps = parsed.latex_steps ?? [];
    const rawSteps: AttemptStepDto[] = steps.map(
      (expression, idx): AttemptStepDto => ({
        expression,
        isFinal: idx === steps.length - 1,
      }),
    );

    return {
      extractedText: steps.join(' | '),
      confidence: parsed.overall_confidence,
      rawSteps,
      topicHint: parsed.topic_hint ?? null,
      finalAnswer: parsed.final_answer,
    };
  }
}
