import { Test, TestingModule } from '@nestjs/testing';
import { SkillsController } from '@modules/skills/skills.controller';
import { SkillsService } from '@modules/skills/skills.service';

const mockTopic = {
  id: 'topic-001',
  unitId: 'unit-001',
  code: 'subtraction_borrow',
  name: 'Subtraction with Borrowing',
  description: null,
  bktPL0: 0.3,
  bktPTransit: 0.1,
  bktPSlip: 0.1,
  bktPGuess: 0.2,
  bktCalibratedAt: null,
};

const mockSkillsService = {
  create: jest.fn().mockResolvedValue(mockTopic),
  findAll: jest.fn().mockResolvedValue([mockTopic]),
  findOne: jest.fn().mockResolvedValue(mockTopic),
  update: jest.fn().mockResolvedValue(mockTopic),
  remove: jest.fn().mockResolvedValue(true),
  getPrerequisites: jest.fn().mockResolvedValue(['T-ADD-CARRY']),
};

describe('SkillsController', () => {
  let controller: SkillsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [{ provide: SkillsService, useValue: mockSkillsService }],
    }).compile();

    controller = module.get<SkillsController>(SkillsController);
    jest.clearAllMocks();
  });

  it('create delegates to SkillsService', async () => {
    const dto = {
      key: 'subtraction_borrow',
      name: 'Subtraction with Borrowing',
    };
    const result = await controller.create(dto);
    expect(mockSkillsService.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockTopic);
  });

  it('findAll returns skill list', async () => {
    const result = await controller.findAll();
    expect(mockSkillsService.findAll).toHaveBeenCalled();
    expect(result).toEqual([mockTopic]);
  });

  it('findOne delegates to SkillsService', async () => {
    const result = await controller.findOne('topic-001');
    expect(mockSkillsService.findOne).toHaveBeenCalledWith('topic-001');
    expect(result).toEqual(mockTopic);
  });

  it('update delegates to SkillsService', async () => {
    const dto = { name: 'Updated Name' };
    const result = await controller.update('topic-001', dto);
    expect(mockSkillsService.update).toHaveBeenCalledWith('topic-001', dto);
    expect(result).toEqual(mockTopic);
  });

  it('remove delegates to SkillsService', async () => {
    const result = await controller.remove('topic-001');
    expect(mockSkillsService.remove).toHaveBeenCalledWith('topic-001');
    expect(result).toBe(true);
  });

  it('prerequisites calls getPrerequisites and returns skillId', async () => {
    const result = controller.prerequisites('topic-001');
    expect(mockSkillsService.getPrerequisites).toHaveBeenCalledWith(
      'topic-001',
    );
    expect(result.skillId).toBe('topic-001');
    const resolved = await (result.prerequisites as unknown as Promise<
      string[]
    >);
    expect(resolved).toEqual(['T-ADD-CARRY']);
  });
});
