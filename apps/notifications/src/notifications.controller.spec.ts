import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let notificationsController: NotificationsController;
  let notificationsService: NotificationsService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            notifyEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    notificationsController = app.get<NotificationsController>(NotificationsController);
    notificationsService = app.get<NotificationsService>(NotificationsService);
  });

  describe('notifyEmail', () => {
    it('should call notificationsService.notifyEmail with the provided data', async () => {
      const dto = { email: 'test@example.com', subject: 'Hello', text: 'World' };
      await notificationsController.notifyEmail(dto as any);
      expect(notificationsService.notifyEmail).toHaveBeenCalledWith(dto);
    });
  });
});
