import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from '@google/generative-ai';
import {
  MathOCRPort,
  MathOCRResult,
  OcrExercise,
} from '@adapters/math-ocr/math-ocr.port';
import { AttemptStepDto } from '@modules/attempts/dto/create-attempt.dto';

interface GeminiExercise {
  problem: string;
  latex_steps: string[];
  final_answer: string;
  overall_confidence: number;
  topic_hint: string | null;
}

interface GeminiOcrResponse {
  exercises: GeminiExercise[];
}

const SYSTEM_PROMPT = `You are an expert transcriber of Chilean elementary school (grades 3-6) handwritten math.
A worksheet photo MAY CONTAIN SEVERAL exercises. Detect EACH exercise separately and, for each,
extract its problem statement and the student's step-by-step solution. Do not merge two exercises.
For each exercise return:
  - problem: the exercise statement only, e.g. "-8 + 5 - (-3)" (NOT the student's work)
  - latex_steps: array of strings, one per step the student wrote
  - final_answer: the student's final result as written
  - overall_confidence: number 0-1 for that exercise
  - topic_hint: short topic guess or null
If the page is unreadable, return exercises: [].`;

// A response schema makes Gemini 2.5 emit clean JSON (no prose / no ``` fences).
const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    exercises: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          problem: { type: SchemaType.STRING },
          latex_steps: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          final_answer: { type: SchemaType.STRING },
          overall_confidence: { type: SchemaType.NUMBER },
          topic_hint: { type: SchemaType.STRING, nullable: true },
        },
        required: [
          'problem',
          'latex_steps',
          'final_answer',
          'overall_confidence',
        ],
      },
    },
  },
  required: ['exercises'],
};

@Injectable()
export class GeminiVisionAdapter implements MathOCRPort {
  private readonly logger = new Logger(GeminiVisionAdapter.name);
  private readonly client: GoogleGenerativeAI;
  // gemini-2.0-flash was shut down 2026-06-01. Default to 2.5-flash, overridable
  // via GEMINI_MODEL so it stays in sync with the ai-engine OCR worker.
  private readonly modelName =
    process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash';
  private readonly apiKey = process.env['GEMINI_API_KEY'] ?? '';

  constructor() {
    this.client = new GoogleGenerativeAI(this.apiKey);
    // Google AI Studio keys start with "AIza". Surface a misconfigured key at
    // boot instead of silently returning confidence:0 after a slow timeout.
    if (this.apiKey === '') {
      this.logger.error('GEMINI_API_KEY is empty — OCR will always fail.');
    } else if (!this.apiKey.startsWith('AIza')) {
      this.logger.warn(
        `GEMINI_API_KEY does not look like an AI Studio key (expected "AIza…", got "${this.apiKey.slice(0, 4)}…"). ` +
          'The @google/generative-ai SDK authenticates via ?key=<API_KEY>; OAuth/ephemeral tokens will be rejected.',
      );
    }
  }

  async extract(imageBytes: Buffer): Promise<MathOCRResult> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
          // gemini-2.5-flash "thinks" by default and those tokens count against
          // this budget; the legacy SDK can't disable thinking, so we give enough
          // headroom that the JSON is never truncated mid-string (the 1536 cap
          // starved it → "Unterminated string in JSON").
          maxOutputTokens: 8192,
        },
      });

      const imagePart = {
        inlineData: {
          mimeType: 'image/jpeg' as const,
          data: imageBytes.toString('base64'),
        },
      };

      const result = await model.generateContent([
        'Transcribe EVERY exercise in this worksheet photo.',
        imagePart,
      ]);
      const text = result.response.text();
      const parsed = this.parseJson(text);

      const rawExercises = Array.isArray(parsed.exercises)
        ? parsed.exercises
        : [];
      const exercises: OcrExercise[] = rawExercises.map((ex) => {
        const steps = Array.isArray(ex.latex_steps) ? ex.latex_steps : [];
        return {
          problem: String(ex.problem ?? ''),
          rawSteps: steps.map(
            (expression, idx): AttemptStepDto => ({
              expression: String(expression),
              isFinal: idx === steps.length - 1,
            }),
          ),
          finalAnswer: ex.final_answer ?? '',
          topicHint: ex.topic_hint ?? null,
          confidence: this.clampConfidence(ex.overall_confidence),
        };
      });

      if (exercises.length === 0) {
        this.logger.warn(
          'Gemini OCR returned no exercises (image likely unreadable).',
        );
      }
      const confidence =
        exercises.length > 0
          ? exercises.reduce((sum, e) => sum + e.confidence, 0) /
            exercises.length
          : 0;

      return { confidence, exercises };
    } catch (error) {
      // Fall back to an empty result, but log enough to diagnose (the SDK error
      // carries the HTTP status when the API rejects the call).
      this.logger.error(
        `Gemini OCR extraction failed (model=${this.modelName}): ${this.describeError(error)}`,
      );
      return { confidence: 0, exercises: [] };
    }
  }

  private parseJson(text: string): GeminiOcrResponse {
    const trimmed = text.replace(/```(?:json)?\n?/g, '').trim();
    try {
      return JSON.parse(trimmed) as GeminiOcrResponse;
    } catch {
      // Belt-and-suspenders: extract the first {...} block if the model wraps it.
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1)) as GeminiOcrResponse;
      }
      throw new Error(`unparseable OCR response: ${trimmed.slice(0, 120)}`);
    }
  }

  private clampConfidence(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      const status = (error as { status?: number }).status;
      return status ? `${error.message} (status=${status})` : error.message;
    }
    return 'unknown error';
  }
}
