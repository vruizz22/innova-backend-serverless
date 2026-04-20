import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryService } from './telemetry.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RawTelemetry,
  RawTelemetryDocument,
} from '@/infrastructure/database/schemas/raw-telemetry.schema';
import { ParseRawTelemetryDto } from './dto/raw-telemetry.dto';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let mockModel: jest.Mocked<Partial<Model<RawTelemetryDocument>>> & {
    insertMany: jest.Mock;
  };

  beforeEach(async () => {
    const mockSave = jest.fn();
    mockModel = Object.assign(
      jest.fn().mockImplementation(() => ({ save: mockSave })),
      { insertMany: jest.fn().mockResolvedValue([]) },
    ) as any;

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
      mockModel.insertMany.mockRejectedValueOnce(new Error('Mongo Error'));
      const mockPayloads = [{} as ParseRawTelemetryDto];

      await expect(service.batchProcessTelemetry(mockPayloads)).rejects.toThrow(
        'Mongo Error',
      );
    });
  });
});
