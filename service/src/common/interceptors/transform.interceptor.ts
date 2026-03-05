import { Result } from '@/common/result';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): any {
    const request = context.switchToHttp().getRequest();
    const path = request?.path || '';
    // Streaming endpoints manage their own response lifecycle; skip wrapping/catchError.
    if (path.includes('/api/academic/chat-process') || path.includes('/api/chatgpt/chat-process')) {
      return next.handle();
    }
    return next.handle().pipe(
      map(data => {
        const response = context.switchToHttp().getResponse();
        const requestId = request?.requestId;
        response.statusCode = 200;
        /* 微信类支付类通知接口需要原样输出 */
        if (path.includes('notify')) {
          return data;
        }
        const message = response.status < 400 ? null : response.statusText;
        return { ...Result.success(data, message), requestId };
      }),
      catchError(error => {
        const statusCode = error.status || 500;
        const message = (error.response || 'Internal server error') as string;
        return throwError(new HttpException(message, statusCode));
      }),
    );
  }
}
