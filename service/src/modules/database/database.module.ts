import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { DatabaseService } from './database.service';

// Import all entities explicitly
import { AppEntity } from '../app/app.entity';
import { AppCatsEntity } from '../app/appCats.entity';
import { UserAppsEntity } from '../app/userApps.entity';
import { AutoReplyEntity } from '../autoReply/autoReply.entity';
import { BadWordsEntity } from '../badWords/badWords.entity';
import { ViolationLogEntity } from '../badWords/violationLog.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { CramiEntity } from '../crami/crami.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { ModelsEntity } from '../models/models.entity';
import { OrderEntity } from '../order/order.entity';
import { PluginEntity } from '../plugin/plugin.entity';
import { Share } from '../share/share.entity';
import { SigninEntity } from '../signin/signIn.entity';
import { UserEntity } from '../user/user.entity';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { VerificationEntity } from '../verification/verification.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        ({
          type: 'mysql',
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT, 10),
          username: process.env.DB_USER,
          password: process.env.DB_PASS,
          database: process.env.DB_DATABASE,
          // entities: [__dirname + '/../**/*.entity{.ts,.js}'], // <-- Remove glob pattern
          entities: [
            // <-- Use explicit array of imported classes
            Share,
            AutoReplyEntity,
            CramiEntity,
            CramiPackageEntity,
            BadWordsEntity,
            ChatGroupEntity,
            VerificationEntity,
            SigninEntity,
            ViolationLogEntity,
            ModelsEntity,
            UserEntity,
            AccountLogEntity,
            FingerprintLogEntity,
            BalanceEntity,
            UserBalanceEntity,
            PluginEntity,
            ConfigEntity,
            ChatLogEntity,
            UserAppsEntity,
            AppCatsEntity,
            AppEntity,
            OrderEntity,
          ],
          synchronize: false,
          logging: false,
          charset: 'utf8mb4',
          timezone: '+08:00',
          extra: {
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
          },
        } as DataSourceOptions),
    }),
  ],
  providers: [DatabaseService],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private readonly connection: DataSource) {}
  private readonly logger = new Logger(DatabaseModule.name);

  async onModuleInit(): Promise<void> {
    const { database } = this.connection.options;
    this.logger.log(`Your MySQL database named ${database} has been connected`);

    // Attach low-level mysql pool listeners to avoid unhandled fatal socket events
    // when upstream DB closes idle connections.
    const driver: any = (this.connection as any)?.driver;
    const pool = driver?.pool;
    const bindConnectionError = (conn: any) => {
      if (!conn || conn.__lensErrorBound) return;
      conn.__lensErrorBound = true;
      conn?.on?.('error', (err: any) => {
        this.logger.error(`MySQL connection error: ${err?.code || ''} ${err?.message || err}`);
      });
    };

    if (pool?.on) {
      pool.on('error', (err: any) => {
        this.logger.error(`MySQL pool error: ${err?.code || ''} ${err?.message || err}`);
      });
      pool.on('connection', (conn: any) => {
        bindConnectionError(conn);
      });
      // Some mysql2 pools create initial connections before we bind listeners.
      const existingConnections = pool?._allConnections;
      if (Array.isArray(existingConnections)) {
        existingConnections.forEach((conn: any) => bindConnectionError(conn));
      }
      pool.on?.('acquire', (conn: any) => {
        bindConnectionError(conn);
      });
    }
  }
}
