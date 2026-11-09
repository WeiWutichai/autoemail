# PLAN.md — Milestone 2: ERP Connections

สถานะ: 🟡 กำลังทำ (เริ่ม 2026-11-09)
ขอบเขต: จัดการ connection ไป ERP หลาย database ผ่านหน้าเว็บ (CRUD + Test connection), DataSource factory, SqlValidator
นอกขอบเขต M2: sync config / ดึงข้อมูล / queue / template / SMTP (M3–M5) — ไม่ทำ

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 4 (`erp_connections`), 5.2, 7; แผนและผล M1 อยู่ที่ `docs/milestones/M1.md`

## ข้อมูลจากผู้ใช้ (สรุปจาก open questions)

- ERP: **SQL Server**, ดึงด้วย SQL query (poll) ทุก **5 นาที**; เอกสาร **PR / PO** ที่ยังไม่อนุมัติ — query อยู่ที่ `docs/erp-queries/pr-po-pending-approval.sql` (ใช้จริงใน M5)
- ข้อมูลเชื่อมต่อ ERP กรอกผ่านหน้าเว็บ `/connections` และมีได้หลาย connection
- SMTP: Google Workspace **App Password**, ไม่มีไฟล์แนบ, ปริมาณไม่จำกัด (เพดานจริง ~2,000 ฉบับ/วัน/บัญชี — ตัดสินใจใน M4)

## การตัดสินใจก่อนเริ่ม (ผู้ใช้เลือก 2026-11-09)

- เพิ่มคอลัมน์ `erp_connections.trust_server_cert` (boolean, default false) สำหรับ SQL Server ที่ใช้ certificate ออกเอง
- ลบ connection ได้เฉพาะตัวที่ยังไม่มี sync config / contact / mail queue ผูกอยู่ — ไม่งั้นตอบ 409 `CONNECTION_IN_USE` ให้ปิดใช้งานแทน

## Tasks (ทำตามลำดับ)

### T1 — Shared schemas
- [ ] `packages/shared/src/connections.ts`: `dbTypeSchema`, `DEFAULT_PORTS`, `erpConnectionSchema` (DTO มี `hasPassword`, ไม่มี password), `createErpConnectionSchema`, `updateErpConnectionSchema` (password ว่าง/ไม่ส่ง = คงเดิม), `testConnectionResultSchema`
- [ ] unit test schema

### T2 — Prisma: `trustServerCert`
- [ ] เพิ่ม field `trustServerCert Boolean @default(false) @map("trust_server_cert")` + migration `erp_connection_trust_server_cert`

### T3 — SqlValidator
- [ ] `apps/api/src/common/sql/sql-validator.ts`: ตัด comment / string literal ก่อนตรวจ; ต้องขึ้นต้นด้วย `SELECT` หรือ `WITH`; ห้าม `;`, `INTO`, `EXEC`/`EXECUTE`, `xp_`/`sp_`, DML/DDL (`INSERT UPDATE DELETE MERGE DROP ALTER CREATE TRUNCATE GRANT REVOKE DENY`), `OPENROWSET OPENQUERY OPENDATASOURCE BULK WAITFOR DBCC BACKUP RESTORE SHUTDOWN DECLARE`
- [ ] unit test: query PR/PO จริงผ่าน, ทุก keyword ต้องห้ามถูกปฏิเสธ, keyword ใน string/comment ไม่ทำให้ผิด

### T4 — ERP DataSource factory
- [ ] ติดตั้ง `knex` + driver `tedious` (SQL Server), `pg`, `mysql2`, `oracledb` (thin mode)
- [ ] `apps/api/src/erp/erp-datasource.factory.ts`: สร้าง Knex instance ต่อ connection (cache ตาม `id` + `updatedAt`, ปิด pool เก่าเมื่อ config เปลี่ยน), pool max `ERP_MAX_CONNECTIONS`, timeout `ERP_QUERY_TIMEOUT_MS`, `testConnection()` รัน `SELECT 1` (Oracle: `FROM DUAL`), ปิดทุก pool ตอน shutdown
- [ ] เพิ่ม `ERP_QUERY_TIMEOUT_MS`, `ERP_MAX_CONNECTIONS` ใน env schema ของ api
- [ ] unit test: config ที่ส่งให้ Knex ต่อ db type (รวม `encrypt` / `trustServerCertificate`), cache / invalidate

### T5 — Connections API
- [ ] `ConnectionsModule`: `GET /connections`, `GET /connections/:id`, `POST /connections`, `PATCH /connections/:id`, `DELETE /connections/:id`, `POST /connections/:id/test` (บันทึก `lastTestAt`, `lastTestOk`)
- [ ] password เข้ารหัสด้วย `CryptoService`; ไม่คืน `passwordEnc` — ใช้ `hasPassword`
- [ ] error ที่ได้จาก driver ตอน test ต้องไม่มี password / connection string
- [ ] unit test service + e2e (ใช้ Postgres test เป็น "ERP" ชนิด POSTGRES เพื่อทดสอบ driver จริง)

### T6 — Web `/connections`
- [ ] ตาราง connection + สถานะ test ล่าสุด, ฟอร์มเพิ่ม/แก้ (port default ตามประเภท DB, password แสดง •••• และเว้นว่าง = คงเดิม), ปุ่ม Test, เปิด/ปิดใช้งาน, ลบ (พร้อมยืนยัน)
- [ ] UI copy ภาษาไทย, error code แปลเป็นไทยใน `error-messages.ts`

## QC Gate M2

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน — แนบ output
- [ ] `docker compose build` ผ่าน (driver ติดตั้งใน image ได้)
- [ ] ผู้ใช้เพิ่ม connection SQL Server จริงจากหน้าเว็บ แล้วกด Test ผ่านอย่างน้อย 1 ตัว
- [ ] ไม่มี secret ใน git, response ของ API ไม่มี password
- [ ] สรุป commit list ของ M2 ท้ายไฟล์นี้

## M2 Result (Claude Code เติมตอนจบ)
