import { Result } from '@/common/result';
import { sanitizeClientErrorMessage } from '@/common/utils';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class AllExceptionsFilter<_T> implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId;
    const userId = (request as any)?.user?.id;

    // 检查异常是否是 HttpException 类型
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      const rawMessage = Array.isArray(exceptionResponse?.message)
        ? exceptionResponse.message[0]
        : typeof exceptionResponse?.message === 'string'
        ? exceptionResponse.message
        : exception.message;
      const safeMessage = sanitizeClientErrorMessage(rawMessage, status);
      const payload = {
        event: 'http_exception',
        requestId,
        userId,
        path: request?.path,
        status,
        message: rawMessage,
        response: exceptionResponse,
      };
      const serialized = JSON.stringify(payload);
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR && (exception as any)?.stack) {
        Logger.error(serialized, (exception as any).stack, 'AllExceptionsFilter');
      } else {
        Logger.warn(serialized, 'AllExceptionsFilter');
      }

      // 如果是 ValidationPipe 抛出的异常
      if (status === HttpStatus.BAD_REQUEST && Array.isArray(exceptionResponse?.message)) {
        response.status(status).json({
          code: status,
          message: safeMessage,
          data: null,
          requestId,
        });
        return;
      }

      response.status(status).json({
        code: status,
        message: safeMessage,
        data: null,
        requestId,
      });
      return;
    }

    // 处理其他类型的异常
    const err = exception as Error;
    const payload = {
      event: 'unhandled_exception',
      requestId,
      userId,
      path: request?.path,
      message: err?.message || 'Unknown error',
    };
    Logger.error(JSON.stringify(payload), err?.stack, 'AllExceptionsFilter');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: sanitizeClientErrorMessage(err?.message || '', HttpStatus.INTERNAL_SERVER_ERROR),
      data: null,
      requestId,
    });
  }
}
