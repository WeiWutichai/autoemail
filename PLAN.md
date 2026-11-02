# PLAN.md — Milestone 1: Foundation

สถานะ: 🟡 รอเริ่ม
ขอบเขต: โครง monorepo, DB schema, Admin auth, crypto service, Docker Compose
นอกขอบเขต M1: ERP connection, sync, template, queue, logs (อยู่ M2–M6 — ยังไม่ทำ)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 3 (stack), 4 (schema), 5.1 (auth), 7 (security)

## Tasks (ทำตามลำดับ)

### T1 — Monorepo scaffold
- [ ] `pnpm init` + `pnpm-workspace.yaml` (`apps/*`, `packages/*`) + `turbo.json`
- [ ] `apps/api` NestJS (ใช้ `nest new` แบบ bare), `apps/worker` NestJS standalone, `apps/web` Next.js 14 App Router + Tailwind + shadcn init, `packages/shared` (tsup)
- [ ] root scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `db:migrate`, `db:seed`
- [ ] eslint + prettier config ร่วม, tsconfig base strict
- [ ] `.gitignore`, `.env.example` (ไฟล์ให้มาแล้ว), `README.md` สั้นๆ
- Verify: `pnpm install && pnpm lint && pnpm typecheck` ผ่าน, `pnpm dev` ขึ้นทั้ง 3 app

### T2 — Docker Compose
- [ ] `docker-compose.yml`: `postgres:16`, `redis:7`, `api`, `worker`, `web` (api/worker/web ใช้ `Dockerfile` แบบ multi-stage ใน apps แต่ละตัว)
- [ ] volume สำหรับ postgres + `storage/attachments`
- [ ] healthcheck ให้ postgres/redis, `depends_on: condition: service_healthy`
- Verify: `docker compose up -d postgres redis` แล้ว `pg_isready` + `redis-cli ping` ผ่าน

### T3 — Prisma schema (ทั้ง 8 ตาราง + audit)
- [ ] `apps/api/prisma/schema.prisma` ตาม `docs/DESIGN.md` section 4: `AdminUser`, `ErpConnection`, `ErpSyncConfig`, `Contact`, `SmtpConfig`, `MailTemplate`, `MailQueue`, `MailLog`, `AdminAuditLog`
- [ ] enum: `DbType (MSSQL|ORACLE|MYSQL|POSTGRES)`, `SyncKind (CONTACTS|OUTBOX)`, `MailStatus (PENDING|SENDING|SENT|FAILED|DEAD|CANCELLED)`, `MailEvent (QUEUED|SENDING|SENT|FAILED|RETRY|DEAD|CANCELLED)`
- [ ] unique: `Contact(connectionId, erpRefId)`, `MailQueue(connectionId, erpRefId)`; index: `MailQueue(status, nextRetryAt)`, `MailLog(queueId, createdAt)`
- [ ] migration แรก `init`
- [ ] `PrismaModule` global + `PrismaService` (onModuleInit/enableShutdownHooks)
- Verify: `pnpm db:migrate` ผ่าน, `prisma validate` ผ่าน

### T4 — Crypto service
- [ ] `apps/api/src/common/crypto/crypto.service.ts`: `encrypt(plain): string` → `v1:<iv_b64>:<tag_b64>:<cipher_b64>`, `decrypt(enc): string`, AES-256-GCM, key = `MASTER_KEY` (32 bytes base64) — throw ตอน boot ถ้า key ไม่ถูกต้อง
- [ ] ย้ายไป `packages/shared`? **ไม่** — worker จะ import จาก api ผ่าน path alias ใน M5; ตอนนี้อยู่ใน api พอ
- [ ] unit test: round-trip, key ผิด → throw, tamper ciphertext → throw
- Verify: `pnpm test --filter api` ผ่าน

### T5 — Admin auth
- [ ] `AuthModule`: `POST /auth/login` (email, password) → set refresh cookie httpOnly/secure/sameSite=strict, คืน `{ accessToken, user }`
- [ ] `POST /auth/refresh` (อ่าน cookie) → access ใหม่ + rotate refresh
- [ ] `POST /auth/logout` → clear cookie
- [ ] `JwtAuthGuard` เป็น global guard, `@Public()` decorator สำหรับ `/auth/login`, `/health`
- [ ] `@CurrentUser()` decorator
- [ ] rate limit `/auth/login` 5 req/min/IP (`@nestjs/throttler`)
- [ ] `AdminUsersModule`: `GET /admin-users`, `POST /admin-users`, `PATCH /admin-users/:id` (name, isActive), `POST /admin-users/:id/reset-password` — ไม่มี DELETE
- [ ] `apps/api/src/cli/seed-admin.ts` อ่าน `ADMIN_EMAIL`, `ADMIN_PASSWORD` จาก env → สร้างถ้ายังไม่มี
- [ ] e2e: login สำเร็จ / ผิดรหัส 401 / user inactive 401 / refresh ได้ / เข้า route ที่ guard โดยไม่มี token 401
- Verify: `pnpm test:e2e` ผ่าน

### T6 — Web: login + shell
- [ ] `apps/web`: หน้า `/login`, layout หลักมี sidebar 5 เมนู (Connections, Contacts, Templates, Logs, Admin users — ตอนนี้เป็นหน้าเปล่า "coming soon")
- [ ] API client (`fetch` wrapper) แนบ access token, auto refresh เมื่อ 401 หนึ่งครั้ง
- [ ] middleware redirect ไป `/login` ถ้าไม่มี session
- [ ] หน้า `/admin-users` ใช้งานได้ครบ (list / add / deactivate / reset password)
- Verify: login จาก browser → เห็น sidebar → จัดการ admin user ได้

## QC Gate M1 (ต้องผ่านทั้งหมดก่อน commit สุดท้ายและก่อนเริ่ม M2)

- [ ] `pnpm lint` ผ่าน — แนบ output
- [ ] `pnpm typecheck` ผ่าน — แนบ output
- [ ] `pnpm test` + `pnpm test:e2e` ผ่าน — แนบ output + จำนวน test
- [ ] `docker compose up` ขึ้นครบ 5 service, `GET /health` ตอบ 200
- [ ] Login จาก web ได้, refresh token หมุนได้
- [ ] ไม่มี secret ใน git (`git grep -i "MASTER_KEY=" -- ':!.env.example'` ว่าง)
- [ ] สรุป commit list ของ M1 ท้ายไฟล์นี้

## Open questions (ตอบก่อนเริ่ม M2 ไม่กระทบ M1)

- ERP ปล่อยเมลแบบไหน: ตาราง outbox / API / SMTP / mailbox
- ERP ใช้ DB อะไร
- ปริมาณเมลต่อวัน
- SMTP: App Password หรือ Relay + IP allowlist

## M1 Result (Claude Code เติมตอนจบ)

_ยังไม่เริ่ม_
