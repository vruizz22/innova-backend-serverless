import { Test, TestingModule } from '@nestjs/testing';
import { ItemsController } from '@modules/items/items.controller';
import { ItemsService } from '@modules/items/items.service';

const mockItem = {
  id: 'item-001',
  topicId: 'topic-001',
  topicCode: 'T-SUB-BORROW',
  topicName: 'Sustracción con préstamo',
  content: {
    prompt: '53 - 26 = ?',
    problem: '53 - 26 = ?',
    expectedAnswer: 27,
  },
  difficulty: 'easy' as const,
  irtA: 1.2,
  irtB: -0.5,
  createdAt: new Date(),
};

const mockItemsService = {
  create: jest.fn().mockResolvedValue(mockItem),
  findAll: jest.fn().mockResolvedValue([mockItem]),
  findOne: jest.fn().mockResolvedValue(mockItem),
  getIrtParams: jest.fn().mockResolvedValue({ irtA: 1.2, irtB: -0.5 }),
};

describe('ItemsController', () => {
  let controller: ItemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [{ provide: ItemsService, useValue: mockItemsService }],
    }).compile();

    controller = module.get<ItemsController>(ItemsController);
    jest.clearAllMocks();
  });

  it('create delegates to ItemsService', async () => {
    const dto = {
      skillId: 'topic-001',
      content: { prompt: '53 - 26 = ?' },
      irtA: 1.2,
      irtB: -0.5,
    };
    const result = await controller.create(dto);
    expect(mockItemsService.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockItem);
  });

  it('findAll with skillKey passes to ItemsService', async () => {
    const result = await controller.findAll('T-SUB-BORROW', undefined, '10');
    expect(mockItemsService.findAll).toHaveBeenCalledWith('T-SUB-BORROW', 10);
    expect(result).toEqual([mockItem]);
  });

  it('findAll with topic alias passes to ItemsService', async () => {
    await controller.findAll(undefined, 'T-ADD-CARRY', '5');
    expect(mockItemsService.findAll).toHaveBeenCalledWith('T-ADD-CARRY', 5);
  });

  it('findAll without params uses defaults', async () => {
    await controller.findAll(undefined, undefined, undefined);
    expect(mockItemsService.findAll).toHaveBeenCalledWith(undefined, 32);
  });

  it('findOne delegates to ItemsService', async () => {
    const result = await controller.findOne('item-001');
    expect(mockItemsService.findOne).toHaveBeenCalledWith('item-001');
    expect(result).toEqual(mockItem);
  });

  it('getIrtParams delegates to ItemsService', async () => {
    const result = await controller.getIrtParams('item-001');
    expect(mockItemsService.getIrtParams).toHaveBeenCalledWith('item-001');
    expect(result).toEqual({ irtA: 1.2, irtB: -0.5 });
  });
});
