# PLAN.md — Milestone 1: Foundation

สถานะ: 🟢 M1 เสร็จ — รอ review
ขอบเขต: โครง monorepo, DB schema, Admin auth, crypto service, Docker Compose
นอกขอบเขต M1: ERP connection, sync, template, queue, logs (อยู่ M2–M6 — ยังไม่ทำ)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 3 (stack), 4 (schema), 5.1 (auth), 7 (security)

## Tasks (ทำตามลำดับ)

### T1 — Monorepo scaffold
- [x] `pnpm init` + `pnpm-workspace.yaml` (`apps/*`, `packages/*`) + `turbo.json`
- [x] `apps/api` NestJS (ใช้ `nest new` แบบ bare), `apps/worker` NestJS standalone, `apps/web` Next.js 14 App Router + Tailwind + shadcn init, `packages/shared` (tsup)
- [x] root scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `db:migrate`, `db:seed`
- [x] eslint + prettier config ร่วม, tsconfig base strict
- [x] `.gitignore`, `.env.example` (ไฟล์ให้มาแล้ว), `README.md` สั้นๆ
- Verify: `pnpm install && pnpm lint && pnpm typecheck` ผ่าน, `pnpm dev` ขึ้นทั้ง 3 app

### T2 — Docker Compose
- [x] `docker-compose.yml`: `postgres:16`, `redis:7`, `api`, `worker`, `web` (api/worker/web ใช้ `Dockerfile` แบบ multi-stage ใน apps แต่ละตัว)
- [x] volume สำหรับ postgres + `storage/attachments`
- [x] healthcheck ให้ postgres/redis, `depends_on: condition: service_healthy`
- Verify: `docker compose up -d postgres redis` แล้ว `pg_isready` + `redis-cli ping` ผ่าน

### T3 — Prisma schema (ทั้ง 8 ตาราง + audit)
- [x] `apps/api/prisma/schema.prisma` ตาม `docs/DESIGN.md` section 4: `AdminUser`, `ErpConnection`, `ErpSyncConfig`, `Contact`, `SmtpConfig`, `MailTemplate`, `MailQueue`, `MailLog`, `AdminAuditLog`
- [x] enum: `DbType (MSSQL|ORACLE|MYSQL|POSTGRES)`, `SyncKind (CONTACTS|OUTBOX)`, `MailStatus (PENDING|SENDING|SENT|FAILED|DEAD|CANCELLED)`, `MailEvent (QUEUED|SENDING|SENT|FAILED|RETRY|DEAD|CANCELLED)`
- [x] unique: `Contact(connectionId, erpRefId)`, `MailQueue(connectionId, erpRefId)`; index: `MailQueue(status, nextRetryAt)`, `MailLog(queueId, createdAt)`
- [x] migration แรก `init`
- [x] `PrismaModule` global + `PrismaService` (onModuleInit/enableShutdownHooks)
- Verify: `pnpm db:migrate` ผ่าน, `prisma validate` ผ่าน

### T4 — Crypto service
- [x] `apps/api/src/common/crypto/crypto.service.ts`: `encrypt(plain): string` → `v1:<iv_b64>:<tag_b64>:<cipher_b64>`, `decrypt(enc): string`, AES-256-GCM, key = `MASTER_KEY` (32 bytes base64) — throw ตอน boot ถ้า key ไม่ถูกต้อง
- [x] ย้ายไป `packages/shared`? **ไม่** — worker จะ import จาก api ผ่าน path alias ใน M5; ตอนนี้อยู่ใน api พอ
- [x] unit test: round-trip, key ผิด → throw, tamper ciphertext → throw
- Verify: `pnpm test --filter api` ผ่าน

### T5 — Admin auth
- [x] `AuthModule`: `POST /auth/login` (email, password) → set refresh cookie httpOnly/secure/sameSite=strict, คืน `{ accessToken, user }`
- [x] `POST /auth/refresh` (อ่าน cookie) → access ใหม่ + rotate refresh
- [x] `POST /auth/logout` → clear cookie
- [x] `JwtAuthGuard` เป็น global guard, `@Public()` decorator สำหรับ `/auth/login`, `/health`
- [x] `@CurrentUser()` decorator
- [x] rate limit `/auth/login` 5 req/min/IP (`@nestjs/throttler`)
- [x] `AdminUsersModule`: `GET /admin-users`, `POST /admin-users`, `PATCH /admin-users/:id` (name, isActive), `POST /admin-users/:id/reset-password` — ไม่มี DELETE
- [x] `apps/api/src/cli/seed-admin.ts` อ่าน `ADMIN_EMAIL`, `ADMIN_PASSWORD` จาก env → สร้างถ้ายังไม่มี
- [x] e2e: login สำเร็จ / ผิดรหัส 401 / user inactive 401 / refresh ได้ / เข้า route ที่ guard โดยไม่มี token 401
- Verify: `pnpm test:e2e` ผ่าน

### T6 — Web: login + shell
- [x] `apps/web`: หน้า `/login`, layout หลักมี sidebar 5 เมนู (Connections, Contacts, Templates, Logs, Admin users — ตอนนี้เป็นหน้าเปล่า "coming soon")
- [x] API client (`fetch` wrapper) แนบ access token, auto refresh เมื่อ 401 หนึ่งครั้ง
- [x] middleware redirect ไป `/login` ถ้าไม่มี session
- [x] หน้า `/admin-users` ใช้งานได้ครบ (list / add / deactivate / reset password)
- Verify: login จาก browser → เห็น sidebar → จัดการ admin user ได้

## QC Gate M1 (ต้องผ่านทั้งหมดก่อน commit สุดท้ายและก่อนเริ่ม M2)

- [x] `pnpm lint` ผ่าน — แนบ output
- [x] `pnpm typecheck` ผ่าน — แนบ output
- [x] `pnpm test` + `pnpm test:e2e` ผ่าน — แนบ output + จำนวน test
- [x] `docker compose up` ขึ้นครบ 5 service, `GET /health` ตอบ 200
- [x] Login จาก web ได้, refresh token หมุนได้
- [x] ไม่มี secret ใน git (`git grep -i "MASTER_KEY=" -- ':!.env.example'` ว่าง)
- [x] สรุป commit list ของ M1 ท้ายไฟล์นี้

## Open questions (ตอบก่อนเริ่ม M2 ไม่กระทบ M1)

- ERP ปล่อยเมลแบบไหน: ตาราง outbox / API / SMTP / mailbox
- ~~ประเภทเอกสารที่ต้องแจ้งเตือน~~ → **PR (Purchase Requisition) และ PO (Purchase Order)** (ผู้ใช้ตอบ 2026-11-03)
- ~~ERP ใช้ DB อะไร~~ → **SQL Server** (ผู้ใช้ตอบ 2026-11-03)
- ~~จังหวะที่แจ้ง~~ → **ตอนเอกสารรออนุมัติ**; ระบบต้องตั้ง schedule กวาด (poll) จาก ERP เอง (ผู้ใช้ตอบ 2026-11-03)
- ~~ERP ส่งรายชื่อตาราง/field~~ → ได้ query แล้ว (2026-11-09) ปรับเป็น SELECT เดียวไว้ที่ `docs/erp-queries/pr-po-pending-approval.sql`
  - กรองรายการตาม script ต้นฉบับ (ผู้ใช้ยืนยัน 2026-11-09): ทุกเอกสารที่ `IsApproved = 0 AND IsComplete <> 1 AND IsClosed <> 1`, `DeptCode` ไม่ว่าง
  - ผู้รับ = ทุกแถวใน `Z_MaIL` ของแผนก (`DeptCode`); ข้ามแถวที่ไม่มีอีเมล
  - `erp_ref_id` = `PR|PO:<เลขเอกสาร>:<email>` → 1 ผู้รับได้ 1 ฉบับต่อเอกสาร
- ข้อมูลเชื่อมต่อ ERP: ผู้ใช้กรอกใน `erp-connection.local.env` (gitignore, template คือ `erp-connection.env.example`) → M2 ทำคำสั่ง import เข้า DB แบบเข้ารหัส
- ~~รอบการกวาด~~ → **ทุก 5 นาที** (`pollIntervalSec = 300`) (ผู้ใช้ตอบ 2026-11-09)
- ~~SMTP: App Password หรือ Relay~~ → **App Password** (ผู้ใช้ตอบ 2026-11-09)
- ~~แนบไฟล์~~ → **ไม่ต้องแนบไฟล์** (ผู้ใช้ตอบ 2026-11-09)
- ERP ใช้ DB อะไร
- ปริมาณเมลต่อวัน
- SMTP: App Password หรือ Relay + IP allowlist

## M1 Result (Claude Code เติมตอนจบ)

วันที่: 2026-11-02

### QC gate (output จริง)

```
$ pnpm lint
@erp-mail/web:lint: ✔ No ESLint warnings or errors
 Tasks:    5 successful, 5 total
All matched files use Prettier code style!

$ pnpm typecheck
 Tasks:    5 successful, 5 total

$ pnpm test
@erp-mail/shared:test:  Test Files  1 passed (1)   Tests  3 passed (3)
@erp-mail/worker:test:  Test Files  1 passed (1)   Tests  2 passed (2)
@erp-mail/api:test:     Test Files  12 passed (12) Tests  49 passed (49)
@erp-mail/web:test:     Test Files  1 passed (1)   Tests  6 passed (6)
 Tasks:    5 successful, 5 total                    รวม unit test 60 ตัว

$ TEST_DATABASE_URL=postgresql://erpmail:erpmail@localhost:5433/erpmail_test pnpm test:e2e
✓ test/auth.e2e-spec.ts (9 tests)
✓ test/admin-users.e2e-spec.ts (7 tests)
✓ test/auth-throttle.e2e-spec.ts (1 test)
@erp-mail/api:test:e2e:  Test Files  3 passed (3)  Tests  17 passed (17)

$ docker compose up -d   (ใช้พอร์ต host 5433/6380/3101/3100 เพราะเครื่องนี้มี service อื่นจับพอร์ต default)
api Up · worker Up · web Up · postgres Up (healthy) · redis Up (healthy)
GET /health → 200

$ git grep -i "MASTER_KEY=" -- ':!.env.example'
PLAN.md (ข้อความ checklist นี้เท่านั้น — ไม่มีค่า secret)
```

- Login จาก browser (Chrome → web :3100) ได้, เห็น sidebar, เพิ่ม/ปิดการใช้งาน admin user ได้, reload หน้าแล้ว `/auth/refresh` หมุน token และกู้ session ได้, logout แล้ว middleware ส่งกลับ `/login`
- refresh token rotation + reuse detection ทดสอบใน e2e (`refreshes with rotation and revokes the session on token reuse`)

### การตัดสินใจระหว่างทาง

- Refresh token เก็บ hash ในตารางใหม่ `admin_sessions` (ผู้ใช้เลือก) — logout / deactivate / reset password revoke ได้ทันที, ใช้ token เก่าซ้ำ → revoke ทั้ง session
- `mail_queue.connectionId` / `erpRefId` เป็น nullable เพื่อให้เมลส่งทดสอบเข้า queue + log (ผู้ใช้เลือก)
- เพิ่ม `mail_queue.templateVersion`, `renderedText` ไว้รองรับ versioning ใน M4 (ตาราง version ของ template จะเพิ่มใน M4)
- bcrypt ใช้ `bcryptjs` (pure JS, cost 12) เลี่ยงปัญหา native build บน alpine
- web เรียก API ผ่าน Next rewrites `/api/*` เพื่อให้ cookie เป็น first-party (`sameSite=strict`); `API_URL` ถูก bake ตอน build (Docker build arg)
- refresh ใน browser ใช้ `navigator.locks` กันหลายแท็บ refresh พร้อมกันจนโดน reuse detection
- ห้าม admin ปิดการใช้งานบัญชีตัวเอง (กัน lockout)
- e2e ใช้ DB แยกที่ชื่อต้องลงท้าย `_test` (ไม่งั้น global-setup ปฏิเสธ) เพราะ test จะ truncate ตาราง
- Turbo ตั้ง `envMode: loose` ให้ env ผ่านไปถึง task ได้
- `docker-compose.yml` ตั้งพอร์ต host ได้ผ่าน `*_HOST_PORT` (default เดิม)
- ย้าย `DESIGN.md` → `docs/DESIGN.md`, `env.example` → `.env.example` ให้ตรงกับที่ CLAUDE.md อ้างถึง; `git init` repo ใหม่

### ประเด็นค้างให้ review

- **Rate limit หลัง proxy**: API ยังไม่ตั้ง `trust proxy` จึงเห็น IP ของ web container แทน IP ผู้ใช้ — limit 5/นาทีจะนับรวมทุกคนที่ login ผ่าน web ควรตัดสินใจตอนทำ Nginx (M6) ว่าจะ trust proxy ชั้นไหน
- Cookie ตั้ง `Secure` เสมอ — ใช้ได้บน `http://localhost` ใน Chrome/Firefox แต่ถ้าเปิดผ่าน IP/hostname อื่นแบบ http จะ login ไม่ติดจนกว่าจะมี HTTPS (M6)
- ยังไม่มี audit log ตอนสร้าง/แก้ admin user (ตาราง `admin_audit_logs` อยู่ใน M6)

### Commit list M1

```
c4fc8b2 feat(web): add admin users management page
9e26bd5 feat(web): add login page, auth shell with sidebar and refreshing API client
c4ac12e test(api): add auth and admin users e2e tests
d659ae5 feat(api): add seed-admin CLI
012d7fa feat(api): add admin users management endpoints
1796497 feat(api): add JWT auth with rotating refresh sessions and login rate limit
0b34ae9 feat(api): add zod validation pipe and global error filter
68b28ab feat(shared): add auth and admin user zod schemas
263c8a9 feat(api): add AES-256-GCM crypto service
f579f6b feat(api): add prisma schema, init migration and PrismaModule
ad96738 chore: add docker compose with postgres, redis and app images
f181497 chore: scaffold pnpm/turbo monorepo with api, worker, web and shared
f445eef chore: add project docs and env example
```
