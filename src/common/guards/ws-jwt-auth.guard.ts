import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';

import { UserService } from '../../modules/user/user.service';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = this.extractTokenFromHeader(client.handshake);

    if (!token) {
      this.logger.warn('No authentication token provided');
      throw new WsException('Unauthorized: No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token).catch((err) => {
        this.logger.warn(`Token verification failed: ${err.message}`);
        throw new WsException('Unauthorized: Invalid token');
      });

      if (!payload?.sub) {
        throw new WsException('Unauthorized: Invalid token payload');
      }

      const user = await this.userService.findById(payload.sub).catch((err) => {
        this.logger.error(`Error finding user: ${err.message}`);
        throw new WsException('Unauthorized: Error verifying user');
      });

      if (!user) {
        this.logger.warn(`User not found for ID: ${payload.sub}`);
        throw new WsException('Unauthorized: User not found');
      }

      // Attach minimal user data to the client
      client.data = {
        ...(client.data || {}),
        user: {
          userId: user.id,
          email: user.email,
          name: user.name || 'User',
          role: user.role,
        },
      };

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof WsException
          ? error.message
          : 'Unauthorized: Authentication failed';
      this.logger.error(`Authentication error: ${errorMessage}`, error?.stack);
      throw new WsException(errorMessage);
    }
  }

  private extractTokenFromHeader(handshake: any): string | undefined {
    try {
      // Try to get token from headers
      const authHeader = handshake?.headers?.authorization;
      if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
        return authHeader.split(' ')[1];
      }

      // Try to get token from query parameters
      const token = handshake?.auth?.token || handshake?.query?.token;
      if (token) {
        return token;
      }

      return undefined;
    } catch (error) {
      this.logger.error('Error extracting token:', error);
      return undefined;
    }
  }
}
