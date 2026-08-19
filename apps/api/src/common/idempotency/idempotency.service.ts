import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Kernel dùng chung cho endpoint ghi dữ liệu gọi từ app tài xế (ảnh, chi phí, cập
 * nhật điểm dừng) — docs/api-conventions.md mục 4, ràng buộc 1 CLAUDE.md. Gọi lại
 * cùng (idempotencyKey, endpoint) trả về đúng kết quả trước đó, không tạo bản ghi
 * trùng.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async withIdempotency<T>(
    idempotencyKey: string | undefined,
    endpoint: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!idempotencyKey) {
      return this.prisma.$transaction((tx) => fn(tx));
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey_endpoint: { idempotencyKey, endpoint } },
    });
    if (existing) {
      return existing.responseBody as T;
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await fn(tx);
      try {
        await tx.idempotencyRecord.create({
          data: {
            idempotencyKey,
            endpoint,
            responseBody: JSON.parse(
              JSON.stringify(result),
            ) as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        // Race: 2 request cùng key chạy song song — request thua unique constraint
        // phải coi là trùng, không phá luồng chính (ràng buộc 1, CLAUDE.md).
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException(
            'Yêu cầu với Idempotency-Key này đang được xử lý',
          );
        }
        throw err;
      }
      return result;
    });
  }
}
