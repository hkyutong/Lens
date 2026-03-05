import { TypeOrmQueryFailedFilter } from '@/common/filters/typeOrmQueryFailed.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { CustomLoggerService } from '@/common/logger/custom-logger.service';
import { FastXmlMiddleware } from '@/common/middleware/fast-xml-middleware';
import { RequestIdMiddleware } from '@/common/middleware/request-id.middleware';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import { randomBytes } from 'crypto';
import * as Dotenv from 'dotenv';
import * as fs from 'fs';
import Redis from 'ioredis';
import * as path from 'path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/allExceptions.filter';
Dotenv.config({ path: '.env' });

const isTransientInfraError = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return (
    code === 'PROTOCOL_CONNECTION_LOST' ||
    /Connection lost:\s*The server closed the connection/i.test(message) ||
    /Socket closed unexpectedly/i.test(message)
  );
};

process.on('uncaughtException', (error: any) => {
  if (isTransientInfraError(error)) {
    Logger.error(
      `捕获到基础设施瞬时异常并已拦截，避免服务进程退出: ${error?.code || ''} ${
        error?.message || error
      }`,
      'Bootstrap',
    );
    return;
  }
  throw error;
});

process.on('unhandledRejection', reason => {
  if (isTransientInfraError(reason)) {
    Logger.error(
      `捕获到未处理的基础设施瞬时异常并已拦截: ${(reason as any)?.code || ''} ${
        (reason as any)?.message || reason
      }`,
      'Bootstrap',
    );
    return;
  }
  throw reason;
});

/**
 * 查找文件的多种可能路径
 * @param filename 文件名
 * @returns 找到的文件路径或null
 */
function findFilePath(filename: string): string | null {
  const possiblePaths = [
    path.join(process.cwd(), filename), // 当前工作目录
    path.join(__dirname, '..', filename), // 应用根目录
    path.join(__dirname, filename), // 与主程序同级
    path.resolve(filename), // 绝对路径解析
    path.join(process.cwd(), '..', filename), // 上级目录
    path.join(process.cwd(), 'dist', filename), // dist目录
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

async function bootstrap() {
  console.log('\n======================================');
  console.log('        YutoLens 服务启动中...            ');
  console.log('======================================\n');

  const redisUrl = process.env.REDIS_URL;
  const redis =
    redisUrl && redisUrl.startsWith('redis')
      ? new Redis(redisUrl, {
          // Upstash/managed Redis commonly requires TLS.
          tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
          maxRetriesPerRequest: null,
        })
      : new Redis({
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT),
          username: process.env.REDIS_USER || undefined,
          password: process.env.REDIS_PASSWORD,
          db: Number(process.env.REDIS_DB || 0),
          maxRetriesPerRequest: null,
        });

  const redisJwtTimeoutMs = Number(process.env.REDIS_JWT_TIMEOUT_MS || 3000);
  const withTimeout = async <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>(resolve => {
          timer = setTimeout(() => resolve(fallback), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let jwtSecret = String(process.env.JWT_SECRET || '').trim();
  try {
    const existingSecret = await withTimeout(redis.get('JWT_SECRET'), redisJwtTimeoutMs, null);
    if (existingSecret) {
      jwtSecret = String(existingSecret);
    } else if (!jwtSecret) {
      jwtSecret = randomBytes(256).toString('base64');
      Logger.log('Generating and setting new JWT_SECRET');
      await withTimeout(redis.set('JWT_SECRET', jwtSecret), redisJwtTimeoutMs, 'OK');
    }
  } catch (error) {
    Logger.warn(
      `Redis JWT_SECRET unavailable, fallback to local secret: ${error?.message || error}`,
    );
    if (!jwtSecret) {
      jwtSecret = randomBytes(256).toString('base64');
      Logger.warn('Generated in-memory JWT_SECRET for degraded startup mode');
    }
  }

  if (!process.env.JWT_SECRET && jwtSecret) {
    process.env.JWT_SECRET = jwtSecret;
  }

  // 导入初始化数据库函数
  const { initDatabase } = require('./modules/database/initDatabase');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // 统一请求ID，便于全链路排障
  app.use(new RequestIdMiddleware().use);

  // 在应用配置后，但在监听端口前初始化数据库表结构
  try {
    const initDbOnBoot = process.env.INIT_DB_ON_BOOT !== 'false';
    if (initDbOnBoot) {
      Logger.log('正在预初始化数据库结构...', 'Bootstrap');
      const initDbTimeoutMs = Number(process.env.INIT_DB_TIMEOUT_MS || 60000);
      await Promise.race([
        initDatabase(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`initDatabase timeout after ${initDbTimeoutMs}ms`)),
            initDbTimeoutMs,
          ),
        ),
      ]);
      Logger.log('数据库结构预初始化完成', 'Bootstrap');
    } else {
      Logger.log('已跳过数据库预初始化（INIT_DB_ON_BOOT=false）', 'Bootstrap');
    }
  } catch (dbError) {
    Logger.error(`数据库预初始化失败: ${dbError.message}`, 'Bootstrap');
    // 即使失败也继续启动应用
  }

  // 根据环境变量设置全局 Logger
  app.useLogger(app.get(CustomLoggerService));

  // 使用我们的自定义XML中间件替代express-xml-bodyparser
  const xmlMiddleware = new FastXmlMiddleware();
  app.use(xmlMiddleware.use.bind(xmlMiddleware));

  app.use(
    // Re-enable compression
    compression({
      filter: (req, res) => {
        // 对流式响应路由禁用压缩
        if (
          req.path.includes('/api/chatgpt/chat-process') ||
          req.path.includes('/api/academic/chat-process')
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  // 启用并配置 CORS
  app.enableCors({
    origin: '*', // 或者配置允许的具体域名
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // app.enableCors();
  app.setGlobalPrefix('/api', {
    exclude: [{ path: '*', method: RequestMethod.GET }], // 排除GET请求的通配符路由
  });
  app.useGlobalInterceptors(new TransformInterceptor()); // Re-enable TransformInterceptor
  app.useGlobalFilters(new TypeOrmQueryFailedFilter());
  app.useGlobalFilters(new AllExceptionsFilter()); // Re-enable AllExceptionsFilter
  app.useGlobalPipes(new ValidationPipe());
  app.getHttpAdapter().getInstance().set('views', 'templates/pages');
  app.getHttpAdapter().getInstance().set('view engine', 'hbs');

  // 只在测试环境下启用Swagger
  if (process.env.ISDEV === 'true') {
    const config = new DocumentBuilder()
      .setTitle('YutoLens API')
      .setDescription('YutoLens 服务 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // 添加全局响应定义
    const responseSchema = {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        data: { type: 'object' },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: '请求成功' },
      },
    };

    // 为每个路由添加标准响应格式
    Object.values(document.paths).forEach(path => {
      Object.values(path).forEach(method => {
        method.responses = {
          ...method.responses,
          '200': {
            description: '成功响应',
            content: {
              'application/json': {
                schema: responseSchema,
              },
            },
          },
        };
      });
    });

    SwaggerModule.setup('api-docs', app, document);
    Logger.log(
      'Swagger API文档已启用: http://localhost:' + (process.env.PORT || 3000) + '/api-docs',
      'Main',
    );
  }

  const PORT = process.env.PORT || 3000;

  const server = await app.listen(PORT, () => {
    console.log('\n======================================');
    console.log(`  服务启动成功: http://localhost:${PORT}`);
    console.log('======================================\n');
  });

  server.timeout = 5 * 60 * 1000;
}

bootstrap();
