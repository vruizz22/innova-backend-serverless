import { AdminErrorTagsController } from '@modules/admin/admin-error-tags.controller';
import { AdminErrorTagsService } from '@modules/admin/admin-error-tags.service';
import { ListErrorTagsDto } from '@modules/admin/dto/list-error-tags.dto';

describe('AdminErrorTagsController', () => {
  function setup() {
    const service = {
      listErrorTags: jest.fn().mockResolvedValue({ items: [] }),
      updateErrorTagStatus: jest
        .fn()
        .mockResolvedValue({ code: 'X', status: 'ACTIVE' }),
    } as unknown as AdminErrorTagsService;
    return { controller: new AdminErrorTagsController(service), service };
  }

  it('list() delegates the query DTO to the service', async () => {
    const { controller, service } = setup();
    const query: ListErrorTagsDto = { status: 'DRAFT', limit: 25 };

    await controller.list(query);

    expect(service.listErrorTags).toHaveBeenCalledWith(query);
  });

  it('updateStatus() delegates code + status to the service', async () => {
    const { controller, service } = setup();

    await controller.updateStatus('ARITH_SUB_01', { status: 'DEPRECATED' });

    expect(service.updateErrorTagStatus).toHaveBeenCalledWith(
      'ARITH_SUB_01',
      'DEPRECATED',
    );
  });
});
