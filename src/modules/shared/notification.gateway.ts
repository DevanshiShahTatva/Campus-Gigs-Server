import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';

@WebSocketGateway({ cors: true, namespace: '/notification' })
@Injectable()
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificationGateway');

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UserService)) private readonly userService: UserService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket server initialized');
    server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers['authorization']?.split(' ')[1];
        if (!token) {
          return next(new Error('No token provided'));
        }
        const payload = this.jwtService.verify(token);
        const user = await this.userService.findById(payload.id);
        if (!user) {
          return next(new Error('User not found'));
        }
        (socket as any).user = user;
        next();
      } catch (err) {
        return next(new Error('Invalid token'));
      }
    });
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    client.on('joinRoom', () => {
      const user = (client as any).user;
      if (!user || !user.id) {
        client.disconnect();
        return;
      }
      const userId = user.id;
      client.join(`user_${userId}`);
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendProfileUpdateNotification(userId: string, message: string) {
    this.logger.log(`Emitting profileUpdate to user_${userId}`);
    this.server.to(`user_${userId}`).emit('profileUpdate', { title: 'Profile Updated', message });
  }

  sendBidNotification(userId: string, bidData: any) {
    this.logger.log(`Emitting newBid to user_${userId}`);
    this.server.to(`user_${userId}`).emit('newBid', { 
      title: 'New Bid Received', 
      message: `You received a new bid for your gig "${bidData.gigTitle}"`,
      bidData 
    });
  }
} 