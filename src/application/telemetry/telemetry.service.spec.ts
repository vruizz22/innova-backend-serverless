import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryService } from '@/application/telemetry/telemetry.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RawTelemetry,
  RawTelemetryDocument,
} from '@/infrastructure/database/schemas/raw-telemetry.schema';
import { ParseRawTelemetryDto } from '@/application/telemetry/dto/raw-telemetry.dto';

describe('TelemetryService', () => {
  let service: TelemetryService;

  const mockInsertMany = jest.fn().mockResolvedValue([]);

  // Create a minimal Partial<Model> without implicit any or casting
  const mockModel: Partial<Model<RawTelemetryDocument>> = {
    insertMany: mockInsertMany,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        {
          provide: getModelToken(RawTelemetry.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('batchProcessTelemetry', () => {
    it('should fire insertMany on MongoDB', async () => {
      const mockPayloads: ParseRawTelemetryDto[] = [
        {
          student_uuid: '123e4567-e89b-12d3-a456-426614174000',
          gameId: 'game-1',
          sessionId: 'session-1',
          timestamp: new Date(),
          events: [],
          metadata: { deviceType: 'PC', clientVersion: '1.0', fps: 60 },
        },
      ];

      await service.batchProcessTelemetry(mockPayloads);

      expect(mockInsertMany).toHaveBeenCalledWith(mockPayloads);
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
    });

    it('should explicitly fail and throw error if insertMany fails', async () => {
      mockInsertMany.mockRejectedValueOnce(new Error('Mongo Error'));
      const mockPayloads: ParseRawTelemetryDto[] = [
        {
          student_uuid: '123e4567-e89b-12d3-a456-426614174000',
          gameId: 'game-2',
          sessionId: 'session-2',
          timestamp: new Date(),
          events: [],
          metadata: { deviceType: 'PC', clientVersion: '1.0', fps: 60 },
        },
      ];

      await expect(service.batchProcessTelemetry(mockPayloads)).rejects.toThrow(
        'Mongo Error',
      );
    });
  });
});
