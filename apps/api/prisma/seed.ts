import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Danh sách quyền khớp với các @RequirePermission(...) đang dùng trong controller.
// R1 tối thiểu: một role ADMIN có toàn quyền để dựng dữ liệu thử nghiệm; ma trận
// quyền chi tiết theo 12 vai trò ở docs/roles-channels.md sẽ tách nhỏ dần sau.
const PERMISSIONS: Array<{ code: string; module: string }> = [
  { code: 'customer:create', module: 'customer' },
  { code: 'customer:read', module: 'customer' },
  { code: 'customer:manage-credit', module: 'customer' },
  { code: 'contract:create', module: 'contract-pricing-quote' },
  { code: 'contract:read', module: 'contract-pricing-quote' },
  { code: 'price-list:create', module: 'contract-pricing-quote' },
  { code: 'price-list:read', module: 'contract-pricing-quote' },
  { code: 'price-list:approve', module: 'contract-pricing-quote' },
  { code: 'quote:create', module: 'contract-pricing-quote' },
  { code: 'quote:read', module: 'contract-pricing-quote' },
  { code: 'quote:approve', module: 'contract-pricing-quote' },
  { code: 'quote:update', module: 'contract-pricing-quote' },
  { code: 'quote:convert', module: 'contract-pricing-quote' },
  { code: 'shipment-order:create', module: 'shipment-order' },
  { code: 'shipment-order:read', module: 'shipment-order' },
  { code: 'shipment-order:update', module: 'shipment-order' },
  { code: 'shipment-order:cancel', module: 'shipment-order' },
  { code: 'resource:read', module: 'resource' },
  { code: 'resource:manage', module: 'resource' },
  { code: 'trip:create', module: 'trip' },
  { code: 'trip:read', module: 'trip' },
  { code: 'trip:update', module: 'trip' },
  { code: 'trip:dispatch', module: 'trip' },
  { code: 'trip:cancel', module: 'trip' },
  { code: 'document-type:manage', module: 'document-evidence' },
  { code: 'document-type:read', module: 'document-evidence' },
  { code: 'document-evidence:upload', module: 'document-evidence' },
  { code: 'document-evidence:read', module: 'document-evidence' },
  { code: 'document-evidence:verify', module: 'document-evidence' },
  { code: 'document-evidence:lock', module: 'document-evidence' },
  { code: 'document-evidence:share', module: 'document-evidence' },
  { code: 'ai-job:read', module: 'document-evidence' },
  { code: 'ai-job:submit-result', module: 'document-evidence' },
  { code: 'ai-job:manage', module: 'document-evidence' },
  { code: 'trip-cost:read', module: 'trip-cost' },
  { code: 'trip-cost:manage', module: 'trip-cost' },
  { code: 'trip-cost:approve', module: 'trip-cost' },
  { code: 'advance:manage', module: 'trip-cost' },
  { code: 'advance:approve', module: 'trip-cost' },
  { code: 'advance:pay', module: 'trip-cost' },
  { code: 'reconciliation:read', module: 'reconciliation-billing' },
  { code: 'reconciliation:manage', module: 'reconciliation-billing' },
  { code: 'reconciliation:confirm', module: 'reconciliation-billing' },
  { code: 'reconciliation:reopen', module: 'reconciliation-billing' },
  { code: 'invoice:read', module: 'reconciliation-billing' },
  { code: 'invoice:manage', module: 'reconciliation-billing' },
  { code: 'invoice:issue', module: 'reconciliation-billing' },
  { code: 'invoice:void', module: 'reconciliation-billing' },
  { code: 'invoice:record-payment', module: 'reconciliation-billing' },
  { code: 'accounts-payable:read', module: 'reconciliation-billing' },
  { code: 'accounts-payable:manage', module: 'reconciliation-billing' },
  { code: 'accounts-payable:record-payment', module: 'reconciliation-billing' },
];

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: 'HCM' },
    update: {},
    create: { code: 'HCM', name: 'Chi nhánh Hồ Chí Minh' },
  });

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module },
      create: p,
    });
  }

  const adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị hệ thống (seed)' },
  });

  const allPermissions = await prisma.permission.findMany();
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({
      roleId: adminRole.id,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });

  const passwordHash = await argon2.hash('ChangeMe123!');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@g3.local' },
    update: {},
    create: {
      branchId: branch.id,
      email: 'admin@g3.local',
      passwordHash,
      fullName: 'Quản trị viên (seed)',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  console.log('Seed xong. Đăng nhập thử: admin@g3.local / ChangeMe123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
