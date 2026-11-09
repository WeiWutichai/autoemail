import type { PrismaService } from '../src/prisma/prisma.service';

/** Fake ERP table shaped like the output of docs/erp-queries/pr-po-pending-approval.sql. */
export const OUTBOX_FIXTURE = 'erp_fixture_pr_po';

export const OUTBOX_QUERY = `SELECT doc_type || ':' || order_no || ':' || lower(email) AS erp_ref_id,
  email AS to_email, doc_type, order_no, doc_date, supplier_name, department
FROM ${OUTBOX_FIXTURE}`;

export async function createOutboxFixture(
  prisma: PrismaService,
  rows: [docType: string, orderNo: string, email: string][],
): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${OUTBOX_FIXTURE}`);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE ${OUTBOX_FIXTURE} (doc_type text, order_no text, doc_date timestamp, supplier_name text, department text, email text)`,
  );
  for (const [docType, orderNo, email] of rows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${OUTBOX_FIXTURE} VALUES ($1, $2, '2026-11-09 00:00:00', 'บริษัท ตัวอย่าง จำกัด', 'จัดซื้อ', $3)`,
      docType,
      orderNo,
      email,
    );
  }
}

export async function dropOutboxFixture(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${OUTBOX_FIXTURE}`);
}

export const PR_TEMPLATE = {
  code: 'pr_pending',
  name: 'PR/PO รออนุมัติ',
  subjectTpl: '[รออนุมัติ] {{doc_type}} {{order_no}}',
  bodyHtmlTpl:
    '<p>เรียน แผนก{{department}}</p><p>{{doc_type}} {{order_no}} วันที่ {{formatDate doc_date "long"}} ผู้ขาย {{supplier_name}}</p>',
};
