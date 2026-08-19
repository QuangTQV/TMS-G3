import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE_VIOLATION',
};

/** Đồng nhất khuôn dạng lỗi theo docs/api-conventions.md mục 3. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Có lỗi hệ thống xảy ra',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      const rawMessage =
        typeof res === 'string'
          ? res
          : ((res as { message?: unknown }).message ?? exception.message);
      body = {
        code: STATUS_TO_CODE[status] ?? 'ERROR',
        message: stringifyMessage(rawMessage),
        details:
          typeof res === 'object'
            ? (res as { details?: unknown }).details
            : undefined,
      };
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({ error: body });
  }
}

function stringifyMessage(message: unknown): string {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map(String).join('; ');
  if (message instanceof Error) return message.message;
  return JSON.stringify(message);
}
