import { SkillsService } from '@modules/skills/skills.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Topic } from '@prisma/client';

const BASE_TOPIC: Topic = {
  id: 'topic-1',
  unitId: 'unit-1',
  code: 'T-SUB-BORROW',
  name: 'Resta con préstamo',
  description: 'Resta con reagrupación',
  bktPL0: 0.3,
  bktPTransit: 0.1,
  bktPSlip: 0.1,
  bktPGuess: 0.2,
  bktCalibratedAt: null,
};

const BASE_UNIT = {
  id: 'unit-1',
  code: 'U1',
  name: 'Unidad 1',
  curriculumId: 'curr-1',
  gradeLevel: 3,
  sequence: 1,
  description: null,
};

function buildMockPrisma(): PrismaService {
  const topics = new Map<string, Topic>();
  topics.set('topic-1', { ...BASE_TOPIC });

  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    unit: {
      findFirst: jest.fn().mockResolvedValue(BASE_UNIT),
    },
    topic: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<Topic> }) => {
          const topic = { ...BASE_TOPIC, id: 'new-topic', ...data } as Topic;
          topics.set(topic.id, topic);
          return Promise.resolve(topic);
        }),
      findMany: jest
        .fn()
        .mockImplementation(() => Promise.resolve(Array.from(topics.values()))),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(topics.get(where.id) ?? null),
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<Topic>;
          }) => {
            const existing = topics.get(where.id);
            if (!existing) return Promise.resolve(null);
            const updated = { ...existing, ...data };
            topics.set(where.id, updated);
            return Promise.resolve(updated);
          },
        ),
      delete: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          topics.delete(where.id);
          return Promise.resolve(null);
        }),
    },
    topicPrerequisite: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

describe('SkillsService (wraps Topic)', () => {
  let service: SkillsService;

  beforeEach(() => {
    service = new SkillsService(buildMockPrisma());
  });

  it('create — creates a topic and returns it', async () => {
    const result = await service.create({
      key: 'T-ADD-CARRY',
      name: 'Suma con llevada',
    });
    expect(result.id).toBe('new-topic');
    expect(result.code).toBe('T-ADD-CARRY');
  });

  it('findAll — returns all topics', async () => {
    const result = await service.findAll();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('T-SUB-BORROW');
  });

  it('findOne — returns topic by id', async () => {
    const result = await service.findOne('topic-1');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('T-SUB-BORROW');
  });

  it('findOne — returns null for unknown id', async () => {
    const result = await service.findOne('nonexistent');
    expect(result).toBeNull();
  });

  it('update — updates topic fields', async () => {
    const result = await service.update('topic-1', { name: 'Updated Name' });
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Updated Name');
  });

  it('update — returns null for unknown id', async () => {
    const result = await service.update('nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('remove — returns true when topic exists', async () => {
    const result = await service.remove('topic-1');
    expect(result).toBe(true);
  });

  it('remove — returns false when topic does not exist', async () => {
    const result = await service.remove('nonexistent');
    expect(result).toBe(false);
  });

  it('getPrerequisites — returns empty array initially', async () => {
    const prereqs = await service.getPrerequisites('topic-1');
    expect(prereqs).toEqual([]);
  });
});
