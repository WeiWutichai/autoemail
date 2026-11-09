# ERP Mail Relay

ระบบกลางดึงอีเมลจาก ERP (หลาย database) มากองใน queue แล้วส่งผ่าน Google Workspace SMTP ด้วย template ที่ Admin สร้างเอง พร้อม log ทุกฉบับ
Design doc ฉบับเต็ม: `docs/DESIGN.md` — อ่านก่อนเริ่มทุก milestone

## Stack

- Monorepo: pnpm workspaces + Turborepo
- `apps/api` — NestJS 10, TypeScript strict, Prisma 5, PostgreSQL 16
- worker — entrypoint ที่สองใน `apps/api` (`src/worker.main.ts`), NestJS standalone, BullMQ 5 + Redis 7 (fetch job, send job)
- `apps/web` — Next.js 14 App Router, Tailwind, shadcn/ui, TanStack Query
- `packages/shared` — DTO, zod schema, enum ที่ api/web/worker ใช้ร่วมกัน
- ERP drivers: `mssql`, `oracledb`, `mysql2`, `pg` (โหลดผ่าน Knex dynamic DataSource)
- Mail: Nodemailer + Handlebars
- Auth: JWT access 15m + refresh 7d (httpOnly cookie), bcrypt cost 12
- Secret: AES-256-GCM, key จาก `MASTER_KEY` env

## Commands

```bash
pnpm install
pnpm dev            # api :3001, web :3000, worker
pnpm build
pnpm test           # vitest (unit) ทุก package
pnpm test:e2e       # supertest ใน apps/api
pnpm lint           # eslint + prettier --check
pnpm typecheck
pnpm db:migrate     # prisma migrate dev
pnpm db:seed        # seed admin คนแรกจาก ADMIN_EMAIL / ADMIN_PASSWORD
docker compose up -d postgres redis
```

## Conventions

- **การสื่อสารกับผู้ใช้ใช้ภาษาไทยเท่านั้น** (คำตอบ, คำถาม, สรุปผล, รายงาน QC ใน `PLAN.md`) — ยกเว้น code, comment, commit message และ log ที่ยังเป็นอังกฤษตามกฎด้านล่าง

- ภาษาใน code/comment: อังกฤษ; UI copy: ไทย
- NestJS: module ละ feature (`auth`, `connections`, `sync`, `templates`, `smtp`, `queue`, `logs`); controller บาง, logic อยู่ใน service
- Validation ทุก endpoint ด้วย zod pipe จาก `packages/shared`
- Prisma: ทุก table มี `id uuid`, `createdAt`, `updatedAt`; ชื่อ column camelCase ใน schema, `@map` เป็น snake_case
- ห้ามคืน `passwordEnc` / `passwordHash` ออกจาก API — ใช้ `hasPassword: boolean` แทน
- SQL ของ ERP ที่ Admin ใส่ต้องผ่าน `SqlValidator` (SELECT-only) ก่อน execute เสมอ
- Error ตอบเป็น `{ code, message, details? }` ผ่าน global filter
- Log ผ่าน pino; ห้าม log เนื้อหาเมล / รหัสผ่าน / connection string

## Workflow rules (สำคัญ)

1. อ่าน `PLAN.md` ก่อน แล้วทำตามลำดับใน milestone เดียวเท่านั้น — ห้ามข้ามไป milestone ถัดไป
2. ทำทีละ task → รัน `pnpm lint && pnpm typecheck && pnpm test` ให้ผ่าน → commit 1 เรื่องต่อ 1 commit
3. Commit message: `feat(api): ...`, `fix(worker): ...`, `chore: ...`, `test(api): ...`
4. แก้เฉพาะสิ่งที่ task ระบุ — ไม่ refactor ส่วนอื่น ไม่เพิ่ม feature นอกแผน
5. ถ้าติดปัญหาที่ต้องตัดสินใจ (schema, library, security) ให้หยุดแล้วถามก่อน อย่าเดา
6. เมื่อจบ milestone: เขียนสรุปผล QC gate (output ของ test/lint จริง) ลงท้าย `PLAN.md` แล้วหยุดรอ review
7. ห้ามแก้ `.env` จริง, ห้าม commit secret, `.env.example` เท่านั้นที่อยู่ใน git

## Definition of Done (ทุก task)

- [ ] code + unit test ของ service ที่แตะ
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` ผ่าน (แนบ output)
- [ ] ไม่มี `any`, ไม่มี `console.log`
- [ ] commit แยกเรื่อง
