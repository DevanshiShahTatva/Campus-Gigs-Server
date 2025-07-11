import {
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { ProfileUpdateDto } from './profile.dto';
import { excludeFromObject } from 'src/utils/helper';
import { BuyPlanService } from '../buy-plan/buy-plan.service';
import { NotificationGateway } from '../shared/notification.gateway';

@Injectable()
export class ProfileService {
  constructor(
    @Inject() private userService: UserService,
    @Inject() private buyPlanService: BuyPlanService,
    @Inject() private notificationGateway: NotificationGateway,
  ) {}

  async getProfile(id: string) {
    const userdata = await this.userService.findById(Number(id));
    if (!userdata) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }
    const subscription = await this.buyPlanService.findActivePlan(Number(id));
    return { ...excludeFromObject(userdata, ['password']), subscription };
  }

  async updateProfilePhoto(
    id: string,
    file: Express.Multer.File,
  ) {
    const user = await this.userService.findById(Number(id));

    if (!user) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }

    const updatedUser = await this.userService.updateUser(Number(id), {}, file);
    const subscription = await this.buyPlanService.findActivePlan(Number(id));
    return { ...excludeFromObject(updatedUser, ['password']), subscription };
  }

  async updateProfile(
    id: string,
    body: ProfileUpdateDto,
    file: Express.Multer.File,
  ) {
    const user = await this.userService.findById(Number(id));

    if (!user) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }

    const updatedUser = await this.userService.updateUser(Number(id), body, file);
    const subscription = await this.buyPlanService.findActivePlan(Number(id));

    // Trigger notification
    this.notificationGateway.sendProfileUpdateNotification(id, 'Your profile has been updated.');

    return { ...excludeFromObject(updatedUser, ['password']), subscription };
  }

  async deleteProfilePhoto(id: string) {
    const user = await this.userService.findById(Number(id));

    if (!user) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }

    await this.userService.deleteProfilePhoto(id);

    return { message: "Profile photo deleted successfully" }
  }
}
