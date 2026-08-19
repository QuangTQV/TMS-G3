import { Prisma } from '@prisma/client';

// Validate bằng code thường sau khi AI đọc hóa đơn (ràng buộc 3, CLAUDE.md;
// docs/ai-processing.md nhóm B #11): total phải đúng bằng subtotal + vatAmount,
// và ngày hóa đơn không được ở tương lai.

export function isInvoiceTotalConsistent(
  subtotal: Prisma.Decimal | number,
  vatAmount: Prisma.Decimal | number,
  total: Prisma.Decimal | number,
): boolean {
  const sub = new Prisma.Decimal(subtotal);
  const vat = new Prisma.Decimal(vatAmount);
  const tot = new Prisma.Decimal(total);
  return sub.plus(vat).equals(tot);
}

export function isInvoiceDateValid(invoiceDate: Date): boolean {
  return invoiceDate.getTime() <= Date.now();
}
