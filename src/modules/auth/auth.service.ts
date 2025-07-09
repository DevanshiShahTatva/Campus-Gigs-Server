import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { AgreedTemsPolicy, AuthDto, ResetPasswordDto } from './auth.dto';
import { UserService } from '../user/user.service';
import { SignupDto } from '../user/user.dto';
import { MailService } from '../shared/mail.service';
import { SubscriptionPlanService } from '../subscription-plan/subscription-plan.service';
import { BuyPlanService } from '../buy-plan/buy-plan.service';
import { PROFILE_TYPE } from 'src/utils/enums';
import { excludeFromObject } from 'src/utils/helper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly buyPlanService: BuyPlanService,
    private readonly PrismaService: PrismaService,
  ) {}

  private signJWT(payload: any): string {
    return this.jwtService.sign(payload);
  }

  async registerUser(userBody: SignupDto, file?: Express.Multer.File) {
    const existingUserWithEmail = await this.userService.findByEmail(
      userBody.email,
    );

    if (existingUserWithEmail) {
      throw new ConflictException({
        status: HttpStatus.CONFLICT,
        message: 'Email already registered',
      });
    }

    const skillIds = userBody?.skills?.map(Number) || [];

    const validSkills = await this.PrismaService.skills.findMany({
      where: {
        id: { in: skillIds },
        is_deleted: false,
      },
    });
    
    const user: any = await this.userService.create(userBody, file, validSkills);

    const result = await this.subscriptionPlanService.findFreePlan();

    // Check if we got any plans and the data array exists
    if (result && user && user.id) {
      const freePlan = result;
      if (freePlan && freePlan.id) {
        // Assign free plan to user
        await this.buyPlanService.createFreePlan(
          { subscription_plan_id: freePlan.id },
          user.id,
        );
      } else {
        console.warn('Free plan found but missing _id field:', freePlan);
      }
    } else {
      console.warn('No free plans found for new user');
    }

    const userData = excludeFromObject(user, ['password', 'otp', 'otp_expiry', 'is_deleted']);

    const token = this.signJWT(userData);

    return {
      status: HttpStatus.CREATED,
      message: 'User has been registered',
      data: { user: userData, token: token },
    };
  }

  async login(authData: AuthDto) {
    const findUser = await this.userService.findByEmail(authData.email);

    if (!findUser) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found with this email',
      });
    }

    if (!authData.password) {
      throw new UnauthorizedException({
        status: HttpStatus.UNAUTHORIZED,
        message: 'Password is required',
      });
    }

    const valid = await bcrypt.compare(authData.password, findUser.password);

    if (!valid) {
      throw new UnauthorizedException({
        status: HttpStatus.UNAUTHORIZED,
        message: 'Invalid credentials',
      });
    }

    const userData = excludeFromObject(findUser, ['password', 'otp', 'otp_expiry', 'is_deleted']);

    const token = this.signJWT(userData);

    // Fetch active subscription
    const activeSubscription = await this.buyPlanService.findActivePlan(findUser.id);

    // If the user has a free/basic plan or no subscription and profile_type is not 'user', update it
    if (
      (
        (activeSubscription &&
          activeSubscription.subscription_plan &&
          activeSubscription.subscription_plan.price === 0) ||
        !activeSubscription
      ) &&
      findUser.profile_type !== PROFILE_TYPE.USER
    ) {
      await this.userService.updateUser(findUser.id, { profile_type: PROFILE_TYPE.USER });
      findUser.profile_type = PROFILE_TYPE.USER;
    }

    return {
      status: HttpStatus.OK,
      message: 'You have been login successfully',
      data: { user: userData, token: token, subscription: activeSubscription },
    };
  }

  async forgotPassword(email: string) {
    const findUser = await this.userService.findByEmail(email);
    if (!findUser) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }

    let otp = Math.random();
    otp = Math.floor(100000 + Math.random() * 900000);

    this.userService.updateUser(findUser.id, {
      otp: String(otp),
      otp_expiry: String(Date.now() + 5 * 60 * 1000),
    });

    this.mailService.sendOtpMail(email, findUser.name, otp);

    return {
      message: 'Otp has been send successfully',
      data: {
        email: email,
      },
    };
  }

  async resetPassword(body: ResetPasswordDto) {
    const findUser = await this.userService.findByEmail(body.email);
    if (!findUser) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }

    if (Date.now() > Number(findUser.otp_expiry)) {
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Otp has been expired',
      });
    }

    if (body.otp !== findUser.otp) {
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid otp',
      });
    }

    // check password is same or not
    const isSamePassword = await bcrypt.compare(
      body.password,
      findUser.password,
    );
    if (isSamePassword) {
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Password must be different form previous password',
      });
    }

    const salt = 10;
    const hashpassword = await bcrypt.hash(body.password, salt);

    this.userService.updateUser(findUser.id, {
      password: hashpassword,
      otp: undefined,
      otp_expiry: undefined,
    });

    return { data: { message: 'Password changed successfully' } };
  }

  async agreedTermsPolicy(body: AgreedTemsPolicy) {
    const findUser = await this.userService.findById(body.userId);
    if (!findUser) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }

    return this.userService.updateUser(findUser.id, body);
  }
}
