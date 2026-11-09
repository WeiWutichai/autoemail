# PLAN.md — Milestone 2: ERP Connections

สถานะ: 🟢 M2 เสร็จ (2026-11-09) — รอผู้ใช้ทดสอบกับ SQL Server จริง + review
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
- [x] `packages/shared/src/connections.ts`: `dbTypeSchema`, `DEFAULT_PORTS`, `erpConnectionSchema` (DTO มี `hasPassword`, ไม่มี password), `createErpConnectionSchema`, `updateErpConnectionSchema` (password ว่าง/ไม่ส่ง = คงเดิม), `testConnectionResultSchema`
- [x] unit test schema

### T2 — Prisma: `trustServerCert`
- [x] เพิ่ม field `trustServerCert Boolean @default(false) @map("trust_server_cert")` + migration `erp_connection_trust_server_cert`

### T3 — SqlValidator
- [x] `apps/api/src/common/sql/sql-validator.ts`: ตัด comment / string literal ก่อนตรวจ; ต้องขึ้นต้นด้วย `SELECT` หรือ `WITH`; ห้าม `;`, `INTO`, `EXEC`/`EXECUTE`, `xp_`, DML/DDL (`INSERT UPDATE DELETE MERGE DROP ALTER CREATE TRUNCATE GRANT REVOKE DENY`), `OPENROWSET OPENQUERY OPENDATASOURCE BULK WAITFOR DBCC BACKUP RESTORE SHUTDOWN DECLARE USE KILL RECONFIGURE`
- [x] unit test: query PR/PO จริงผ่าน, ทุก keyword ต้องห้ามถูกปฏิเสธ, keyword ใน string/comment ไม่ทำให้ผิด

### T4 — ERP DataSource factory
- [x] ติดตั้ง `knex` + driver `tedious` (SQL Server), `pg`, `mysql2`, `oracledb` (thin mode)
- [x] `apps/api/src/erp/erp-datasource.factory.ts`: สร้าง Knex instance ต่อ connection (cache ตาม `id` + `updatedAt`, ปิด pool เก่าเมื่อ config เปลี่ยน), pool max `ERP_MAX_CONNECTIONS`, timeout `ERP_QUERY_TIMEOUT_MS`, `testConnection()` รัน `SELECT 1` (Oracle: `FROM DUAL`), ปิดทุก pool ตอน shutdown
- [x] เพิ่ม `ERP_QUERY_TIMEOUT_MS`, `ERP_MAX_CONNECTIONS` ใน env schema ของ api
- [x] unit test: config ที่ส่งให้ Knex ต่อ db type (รวม `encrypt` / `trustServerCertificate`), cache / invalidate

### T5 — Connections API
- [x] `ConnectionsModule`: `GET /connections`, `GET /connections/:id`, `POST /connections`, `PATCH /connections/:id`, `DELETE /connections/:id`, `POST /connections/:id/test` (บันทึก `lastTestAt`, `lastTestOk`)
- [x] password เข้ารหัสด้วย `CryptoService`; ไม่คืน `passwordEnc` — ใช้ `hasPassword`
- [x] error ที่ได้จาก driver ตอน test ต้องไม่มี password / connection string
- [x] unit test service + e2e (ใช้ Postgres test เป็น "ERP" ชนิด POSTGRES เพื่อทดสอบ driver จริง)

### T6 — Web `/connections`
- [x] ตาราง connection + สถานะ test ล่าสุด, ฟอร์มเพิ่ม/แก้ (port default ตามประเภท DB, password แสดง •••• และเว้นว่าง = คงเดิม), ปุ่ม Test, เปิด/ปิดใช้งาน, ลบ (พร้อมยืนยัน)
- [x] UI copy ภาษาไทย, error code แปลเป็นไทยใน `error-messages.ts`

## QC Gate M2

- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน — แนบ output
- [x] `docker compose build` ผ่าน (driver ติดตั้งใน image ได้)
- [ ] ผู้ใช้เพิ่ม connection SQL Server จริงจากหน้าเว็บ แล้วกด Test ผ่านอย่างน้อย 1 ตัว
- [x] ไม่มี secret ใน git, response ของ API ไม่มี password
- [x] สรุป commit list ของ M2 ท้ายไฟล์นี้

## M2 Result (Claude Code เติมตอนจบ)

วันที่: 2026-11-09

### QC gate (output จริง)

```
$ pnpm lint
@erp-mail/web:lint: ✔ No ESLint warnings or errors
 Tasks:    5 successful, 5 total
All matched files use Prettier code style!

$ pnpm typecheck
 Tasks:    5 successful, 5 total

$ pnpm test
@erp-mail/api:test:  Test Files  16 passed (16)
@erp-mail/api:test:       Tests  111 passed (111)
@erp-mail/web:test:  Test Files  2 passed (2)
@erp-mail/web:test:       Tests  13 passed (13)
@erp-mail/worker:test:  Test Files  1 passed (1)
@erp-mail/worker:test:       Tests  2 passed (2)
@erp-mail/shared:test:  Test Files  2 passed (2)
@erp-mail/shared:test:       Tests  10 passed (10)
 Tasks:    5 successful, 5 total

$ pnpm test:e2e
@erp-mail/api:test:e2e:  ✓ test/connections.e2e-spec.ts (8 tests) 5729ms
@erp-mail/api:test:e2e:  ✓ test/auth.e2e-spec.ts (9 tests) 4955ms
@erp-mail/api:test:e2e:  ✓ test/admin-users.e2e-spec.ts (7 tests) 8272ms
@erp-mail/api:test:e2e:  ✓ test/auth-throttle.e2e-spec.ts (1 test) 1936ms
@erp-mail/api:test:e2e:  Test Files  4 passed (4)
@erp-mail/api:test:e2e:       Tests  25 passed (25)

$ docker compose build api web worker
 Image erp-mail-relay-web Built 
 Image erp-mail-relay-worker Built 
 Image erp-mail-relay-api Built

$ git grep secret / passwordEnc ใน response
ไม่มี secret ใน git; API คืน hasPassword เท่านั้น (ตรวจใน e2e: key ของ response ตรงตาม DTO)
```

- ทดสอบใน Chrome (api :3201 + web :3200 ชี้ไปฐาน `erpmail_test`, admin QA ชั่วคราว ลบแล้ว):
  เพิ่ม connection PostgreSQL → ทดสอบ "เชื่อมต่อได้ (212 ms)" → แก้เป็น SQL Server port ที่ไม่มี server
  → ทดสอบ "ล้มเหลว" พร้อมข้อความจาก driver `tedious` → ลบ connection ได้
- **ยังค้าง:** ผู้ใช้ต้องเพิ่ม connection SQL Server ของ ERP จริงจากหน้าเว็บแล้วกด "ทดสอบ" ให้ผ่าน (เครื่องนี้เข้า ERP ไม่ได้)

### การตัดสินใจระหว่างทาง

- เพิ่มคอลัมน์ `trust_server_cert` และลบ connection ได้เฉพาะตัวที่ไม่ถูกใช้ (ผู้ใช้เลือก)
- SQL Server ใช้ driver `tedious` (ตัวที่ Knex 3 ใช้กับ client `mssql`); Oracle ใช้ `oracledb` thin mode ไม่ต้องติดตั้ง Instant Client
- Host รูปแบบ `SERVER\INSTANCE` → แยกเป็น `instanceName` ให้ tedious (ไม่ใช้ port)
- Test connection ใช้ pool ชั่วคราว 1 connection แล้วปิดทันที; pool ถาวร cache ตาม `id + updatedAt` และปิดเมื่อแก้ไข/ลบ
- แก้ host/port/user/password/ssl → ล้างผลทดสอบล่าสุด (`lastTestOk = null`) เพื่อไม่ให้สถานะค้างจาก config เก่า
- ข้อความ error จาก driver ตัด password ออกและจำกัด 300 ตัวอักษร; log ของ Knex เองส่งผ่าน Nest logger (เดิมพิมพ์ stack ลง console ตรง)
- SqlValidator ห้าม `USE`, `KILL`, `RECONFIGURE` เพิ่มจาก DESIGN และไม่ห้าม `sp_` (ต้องเรียกผ่าน `EXEC` ซึ่งห้ามอยู่แล้ว) — query PR/PO จริงผ่าน validator
- ย้ายแผน/ผล M1 ไป `docs/milestones/M1.md`

### ประเด็นค้างให้ review

- เครื่อง dev ไม่มี `.env` — การรัน `docker compose up` ต้องมี `.env` (JWT/MASTER_KEY) ที่ผู้ใช้สร้างเอง
- Oracle / MySQL ทดสอบแค่ระดับ config (unit test) ไม่ได้ต่อ server จริง
- ยังไม่มี audit log การสร้าง/แก้ connection (M6)

### Commit list M2

```
30c8c14 feat(web): add ERP connections management page
49d1da5 feat(api): add ERP connections CRUD and test endpoint
ffd19f1 fix(api): route Knex driver logging through the Nest logger without secrets
aa94d68 feat(api): add Knex-based ERP datasource factory with SQL Server, Postgres, MySQL and Oracle drivers
4c80fa5 feat(api): add SELECT-only SqlValidator
530ae04 feat(api): add trust_server_cert column to erp_connections
aa60c0b feat(shared): add ERP connection zod schemas
ae20031 chore: archive M1 plan and add M2 ERP connections plan
```
