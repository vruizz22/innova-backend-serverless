import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ItemsService } from '@modules/items/items.service';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { PrismaService } from '@infrastructure/database/prisma.service';

const TOPIC = {
  id: 'topic-1',
  code: 'T-SUB-BORROW',
  name: 'Resta con préstamo',
  unitId: 'unit-1',
};
const EXERCISE = {
  id: 'exercise-1',
  topicId: 'topic-1',
  source: 'SYSTEM',
  content: { prompt: '53 - 26 = ?', expectedAnswer: 27 },
  language: 'es',
  irtA: 1.2,
  irtB: -0.5,
  status: 'ACTIVE',
  createdAt: new Date(),
  topic: TOPIC,
};

function buildMockPrisma(): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    topic: {
      findFirst: jest.fn().mockResolvedValue(TOPIC),
      findUnique: jest.fn().mockResolvedValue(TOPIC),
    },
    exercise: {
      create: jest.fn().mockResolvedValue(EXERCISE),
      findMany: jest.fn().mockResolvedValue([EXERCISE]),
      findUnique: jest.fn().mockResolvedValue(EXERCISE),
    },
  } as unknown as PrismaService;
}

describe('ItemsService', () => {
  let service: ItemsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = buildMockPrisma();
    const mockSqs = {
      publishStandard: jest.fn().mockResolvedValue(undefined),
    } as unknown as SqsAdapter;
    service = new ItemsService(prisma, mockSqs);
  });

  describe('create', () => {
    const dto = {
      skillId: 'topic-1',
      content: { prompt: '53 - 26 = ?' },
      irtA: 1.2,
      irtB: -0.3,
    };

    it('creates exercise and returns it', async () => {
      const result = await service.create(dto);
      expect(result).toEqual(EXERCISE);
    });

    it('throws BadRequestException for invalid content schema', async () => {
      await expect(
        service.create({ ...dto, content: { prompt: '' } }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when topic not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns all active exercises', async () => {
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].topicCode).toBe('T-SUB-BORROW');
    });

    it('filters by topic code when provided', async () => {
      const result = await service.findAll('T-SUB-BORROW');
      expect(prisma.exercise.findMany as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { topic: { code: 'T-SUB-BORROW' }, status: 'ACTIVE' },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('maps difficulty from irtB correctly (easy)', async () => {
      const result = await service.findAll();
      expect(result[0].difficulty).toBe('easy');
    });

    it('maps difficulty hard when irtB >= 0.7', async () => {
      (prisma.exercise.findMany as jest.Mock).mockResolvedValue([
        { ...EXERCISE, irtB: 0.9 },
      ]);
      const result = await service.findAll();
      expect(result[0].difficulty).toBe('hard');
    });

    it('maps difficulty medium for irtB between -0.4 and 0.7', async () => {
      (prisma.exercise.findMany as jest.Mock).mockResolvedValue([
        { ...EXERCISE, irtB: 0.2 },
      ]);
      const result = await service.findAll();
      expect(result[0].difficulty).toBe('medium');
    });
  });

  describe('findOne', () => {
    it('returns exercise by id', async () => {
      const result = await service.findOne('exercise-1');
      expect(result.id).toBe('exercise-1');
    });

    it('throws NotFoundException when exercise not found', async () => {
      (prisma.exercise.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getIrtParams', () => {
    it('returns irtA and irtB for exercise', async () => {
      (prisma.exercise.findUnique as jest.Mock).mockResolvedValue({
        irtA: 1.2,
        irtB: -0.3,
      });
      const result = await service.getIrtParams('exercise-1');
      expect(result).toEqual({ irtA: 1.2, irtB: -0.3 });
    });

    it('returns null when exercise not found', async () => {
      (prisma.exercise.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.getIrtParams('nonexistent');
      expect(result).toBeNull();
    });
  });
});
