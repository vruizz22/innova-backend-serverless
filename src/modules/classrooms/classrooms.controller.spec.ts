import { Test, TestingModule } from '@nestjs/testing';
import { ClassroomsController } from '@modules/classrooms/classrooms.controller';
import { ClassroomsService } from '@modules/classrooms/classrooms.service';
import { Role } from '@modules/auth/roles.enum';

const COURSE = { id: 'course-1', name: '4° A · Matemáticas' };
const INVITE = {
  code: 'abc123',
  url: 'http://localhost:3002/join?code=abc123',
};

function mockUser() {
  return {
    supabaseUid: 'uid-1',
    email: 'teacher@demo.com',
    role: Role.TEACHER,
    prismaUserId: 'user-1',
  };
}

function buildMockService() {
  return {
    createForTeacher: jest.fn().mockResolvedValue(COURSE),
    findMineAsTeacher: jest.fn().mockResolvedValue([COURSE]),
    findMineAsStudent: jest.fn().mockResolvedValue([COURSE]),
    findById: jest.fn().mockResolvedValue(COURSE),
    createInvite: jest.fn().mockResolvedValue(INVITE),
    joinWithCode: jest.fn().mockResolvedValue(COURSE),
  };
}

describe('ClassroomsController', () => {
  let controller: ClassroomsController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassroomsController],
      providers: [{ provide: ClassroomsService, useValue: service }],
    }).compile();

    controller = module.get<ClassroomsController>(ClassroomsController);
  });

  it('create delegates to service.createForTeacher', async () => {
    const req = { user: mockUser() };
    const result = await controller.create(req, { name: '4° A' });
    expect(service.createForTeacher).toHaveBeenCalledWith('user-1', {
      name: '4° A',
    });
    expect(result).toEqual(COURSE);
  });

  it('mine delegates to service.findMineAsTeacher', async () => {
    const req = { user: mockUser() };
    const result = await controller.mine(req);
    expect(service.findMineAsTeacher).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([COURSE]);
  });

  it('studentMine delegates to service.findMineAsStudent', async () => {
    const req = { user: mockUser() };
    const result = await controller.studentMine(req);
    expect(service.findMineAsStudent).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([COURSE]);
  });

  it('findOne delegates to service.findById', async () => {
    const result = await controller.findOne('course-1');
    expect(service.findById).toHaveBeenCalledWith('course-1');
    expect(result).toEqual(COURSE);
  });

  it('invite delegates to service.createInvite', async () => {
    const req = { user: mockUser() };
    const result = await controller.invite(req, 'course-1');
    expect(service.createInvite).toHaveBeenCalledWith('course-1', 'user-1', '');
    expect(result).toEqual(INVITE);
  });

  it('join delegates to service.joinWithCode', async () => {
    const req = { user: mockUser() };
    const result = await controller.join(req, { code: 'abc123' });
    expect(service.joinWithCode).toHaveBeenCalledWith('abc123', 'user-1');
    expect(result).toEqual(COURSE);
  });
});
