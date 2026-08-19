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

// Vai trò minh họa để test RBAC — CHƯA phải ma trận quyền chính thức do G3 xác nhận
// (docs/roles-channels.md mục 1 nói rõ mỗi vai trò cần người xác nhận phía G3 trước
// khi chốt). Chỉ dùng để kiểm tra hành vi ẩn/chặn theo quyền trên UI và API, không
// dùng làm căn cứ phân quyền thật khi lên production.
const TEST_ROLES: Array<{
  code: string;
  name: string;
  email: string;
  fullName: string;
  permissionCodes: string[];
}> = [
  {
    code: 'SALES_TEST',
    name: 'Kinh doanh (seed test)',
    email: 'sales@g3.local',
    fullName: 'Kinh doanh (seed test)',
    permissionCodes: [
      'customer:create',
      'customer:read',
      'customer:manage-credit',
      'contract:create',
      'contract:read',
      'price-list:create',
      'price-list:read',
      'quote:create',
      'quote:read',
      'quote:update',
      'quote:convert',
      'shipment-order:create',
      'shipment-order:read',
      'shipment-order:update',
    ],
  },
  {
    code: 'DISPATCHER_TEST',
    name: 'Điều phối viên (seed test)',
    email: 'dispatcher@g3.local',
    fullName: 'Điều phối viên (seed test)',
    permissionCodes: [
      'resource:read',
      'shipment-order:read',
      'trip:create',
      'trip:read',
      'trip:update',
      'trip:dispatch',
      'trip:cancel',
      'document-type:read',
      'document-evidence:upload',
      'document-evidence:read',
      'document-evidence:verify',
      'document-evidence:lock',
      'document-evidence:share',
      'ai-job:read',
    ],
  },
  {
    code: 'ACCOUNTANT_TEST',
    name: 'Kế toán và đối soát (seed test)',
    email: 'accountant@g3.local',
    fullName: 'Kế toán và đối soát (seed test)',
    permissionCodes: [
      'trip-cost:read',
      'trip-cost:manage',
      'trip-cost:approve',
      'advance:manage',
      'advance:approve',
      'advance:pay',
      'reconciliation:read',
      'reconciliation:manage',
      'reconciliation:confirm',
      'reconciliation:reopen',
      'invoice:read',
      'invoice:manage',
      'invoice:issue',
      'invoice:void',
      'invoice:record-payment',
      'accounts-payable:read',
      'accounts-payable:manage',
      'accounts-payable:record-payment',
    ],
  },
  {
    // Kênh thật của tài xế là app riêng, bắt buộc offline-first (chưa code — xem
    // CLAUDE.md mục 4-5). Role này chỉ để soi quyền trên web nội bộ; KHÔNG phản ánh
    // đúng trải nghiệm thật vì RBAC hiện chỉ chặn theo quyền + chi nhánh, chưa chặn
    // theo "chuyến được giao cho ai" — đăng nhập role này trên web vẫn thấy được mọi
    // chuyến trong chi nhánh, không chỉ chuyến của mình.
    code: 'DRIVER_TEST',
    name: 'Tài xế (seed test — chưa có data scope theo chuyến được giao)',
    email: 'driver@g3.local',
    fullName: 'Tài xế (seed test)',
    permissionCodes: [
      'trip:read',
      'trip:update',
      'document-evidence:upload',
      'document-evidence:read',
      'trip-cost:manage',
      'advance:manage',
    ],
  },
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

  for (const testRole of TEST_ROLES) {
    const role = await prisma.role.upsert({
      where: { code: testRole.code },
      update: { name: testRole.name },
      create: { code: testRole.code, name: testRole.name },
    });

    const rolePermissions = await prisma.permission.findMany({
      where: { code: { in: testRole.permissionCodes } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: rolePermissions.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });

    const user = await prisma.user.upsert({
      where: { email: testRole.email },
      update: {},
      create: {
        branchId: branch.id,
        email: testRole.email,
        passwordHash,
        fullName: testRole.fullName,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  console.log('Seed xong. Đăng nhập thử:');
  console.log('  admin@g3.local / ChangeMe123!  (toàn quyền)');
  for (const testRole of TEST_ROLES) {
    console.log(`  ${testRole.email} / ChangeMe123!  (${testRole.name})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
