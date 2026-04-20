import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryService } from './telemetry.service';
import { getModelToken } from '@nestjs/mongoose';
import { RawTelemetry } from '../../infrastructure/database/schemas/raw-telemetry.schema';
import { ParseRawTelemetryDto } from './dto/raw-telemetry.dto';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      insertMany: jest.fn().mockResolvedValue([]),
    };

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
      const mockPayloads = [
        {
          student_uuid: '123e4567-e89b-12d3-a456-426614174000',
          gameId: 'game-1',
        } as ParseRawTelemetryDto,
      ];
      await service.batchProcessTelemetry(mockPayloads);

      expect(mockModel.insertMany).toHaveBeenCalledWith(mockPayloads);
      expect(mockModel.insertMany).toHaveBeenCalledTimes(1);
    });

    it('should explicitly fail and throw error if insertMany fails', async () => {
      mockModel.insertMany.mockRejectedValue(new Error('Mongo Error'));
      const mockPayloads = [{} as ParseRawTelemetryDto];

      await expect(service.batchProcessTelemetry(mockPayloads)).rejects.toThrow(
        'Mongo Error',
      );
    });
  });
});
