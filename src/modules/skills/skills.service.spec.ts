import { SkillsService } from '@modules/skills/skills.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Skill } from '@prisma/client';

const BASE_SKILL: Skill = {
  id: 'skill-1',
  key: 'subtraction_borrow',
  name: 'Resta con préstamo',
  description: 'Resta con reagrupación',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildMockPrisma(): PrismaService {
  const skills = new Map<string, Skill>();
  skills.set('skill-1', { ...BASE_SKILL });

  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    skill: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<Skill> }) => {
          const skill = { ...BASE_SKILL, id: 'new-skill', ...data } as Skill;
          skills.set(skill.id, skill);
          return Promise.resolve(skill);
        }),
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(Array.from(skills.values()));
      }),
      findUnique: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { id?: string; key?: string } }) => {
            if (where.id) return Promise.resolve(skills.get(where.id) ?? null);
            if (where.key)
              return Promise.resolve(
                Array.from(skills.values()).find((s) => s.key === where.key) ??
                  null,
              );
            return Promise.resolve(null);
          },
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<Skill>;
          }) => {
            const existing = skills.get(where.id);
            if (!existing) return Promise.resolve(null);
            const updated = { ...existing, ...data } as Skill;
            skills.set(where.id, updated);
            return Promise.resolve(updated);
          },
        ),
      delete: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          const existing = skills.get(where.id);
          skills.delete(where.id);
          return Promise.resolve(existing);
        }),
    },
  } as unknown as PrismaService;
}

describe('SkillsService', () => {
  let service: SkillsService;

  beforeEach(() => {
    service = new SkillsService(buildMockPrisma());
  });

  it('creates a skill', async () => {
    const skill = await service.create({
      key: 'addition_carry',
      name: 'Suma con llevada',
    });
    expect(skill.key).toBe('addition_carry');
    expect(skill.name).toBe('Suma con llevada');
  });

  it('findAll returns all skills', async () => {
    const skills = await service.findAll();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
  });

  it('findOne returns skill by id', async () => {
    const skill = await service.findOne('skill-1');
    expect(skill?.id).toBe('skill-1');
    expect(skill?.key).toBe('subtraction_borrow');
  });

  it('findOne returns null for non-existent id', async () => {
    const skill = await service.findOne('non-existent');
    expect(skill).toBeNull();
  });

  it('update modifies a skill', async () => {
    const updated = await service.update('skill-1', { name: 'Updated Name' });
    expect(updated?.name).toBe('Updated Name');
  });

  it('update returns null for non-existent skill', async () => {
    const result = await service.update('non-existent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('remove deletes a skill and returns true', async () => {
    const result = await service.remove('skill-1');
    expect(result).toBe(true);
  });

  it('remove returns false for non-existent skill', async () => {
    const result = await service.remove('non-existent');
    expect(result).toBe(false);
  });

  it('getPrerequisites returns empty array', () => {
    expect(service.getPrerequisites('skill-1')).toEqual([]);
  });
});
