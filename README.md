# ERP Mail Relay

ระบบกลางที่ดึงรายการจาก ERP (หลาย database) มาเข้าคิว แล้วส่งอีเมลผ่าน Google Workspace SMTP ด้วย template ที่ Admin สร้างเอง และเก็บ log ทุกฉบับ
ตัวอย่างการใช้งานจริง: แจ้งเตือนเอกสาร PR / PO ที่รออนุมัติไปยังอีเมลของแผนก (`docs/erp-queries/pr-po-pending-approval.sql`)

- Design: [`docs/DESIGN.md`](docs/DESIGN.md)
- แผนงานและผล QC แต่ละ milestone: [`PLAN.md`](PLAN.md), [`docs/milestones/`](docs/milestones)

## เริ่มต้น (เครื่อง dev)

```bash
cp .env.example .env        # แล้วแก้ค่า secret (JWT_SECRET, JWT_REFRESH_SECRET, MASTER_KEY, ADMIN_*)
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed                # สร้าง admin คนแรกจาก ADMIN_EMAIL / ADMIN_PASSWORD
pnpm dev                    # api :3001, web :3000, worker
```

ทดสอบ: `pnpm lint && pnpm typecheck && pnpm test` และ `pnpm test:e2e` (ต้องมี Postgres + Redis; ใช้ `TEST_DATABASE_URL`, `TEST_REDIS_URL`)
Load test 1,000 ฉบับ: `pnpm --filter @erp-mail/api test:load`

## ตั้งค่าใช้งานครั้งแรก (หน้าเว็บ)

1. **Connections** — เพิ่มฐานข้อมูล ERP (SQL Server ฯลฯ) ใช้ user ที่มีสิทธิ์ SELECT อย่างเดียว แล้วกด "ทดสอบ"
2. **SMTP** — เพิ่มบัญชี Google Workspace: `smtp.gmail.com` port `587`, username = อีเมลที่ใช้ส่ง, password = App Password แล้วกด "ทดสอบ" → "ส่งเมลทดสอบ"
3. **Templates** — สร้าง template (เริ่มจากตัวอย่าง PR/PO ได้เลย) ดู preview แล้วส่งทดสอบ
4. **Sync** — เพิ่มการดึงข้อมูลชนิด "เมลที่ต้องส่ง (outbox)" กด "ใส่ query PR/PO รออนุมัติ" เลือก template กด "ตรวจ query" แล้วบันทึก
   - รอบแรกจะส่งเมลของเอกสารที่รออนุมัติอยู่ทั้งหมดในตอนนั้น หลังจากนั้นส่งเฉพาะเอกสารใหม่ (แต่ละเอกสารต่อผู้รับส่งครั้งเดียว)
5. **Logs** — ดูสถานะการส่ง, Retry / Cancel, ตัวเลขสรุปของวันนี้

## Deploy (VPS + HTTPS)

ต้องมี Docker Compose v2.24 ขึ้นไป และ DNS ของโดเมน (เช่น `mail.yourcompany.com`) ชี้มาที่เครื่อง

```bash
cp .env.example .env
# แก้ .env: secret ทั้งหมด, DOMAIN=mail.yourcompany.com, WEB_URL=https://mail.yourcompany.com
# NODE_ENV=production

# 1) ขอใบรับรองครั้งแรก (port 80 ต้องว่าง)
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm -p 80:80 \
  --entrypoint certbot certbot certonly --standalone \
  -d mail.yourcompany.com --email admin@yourcompany.com --agree-tos --no-eff-email

# 2) เปิดระบบทั้งหมด (api รัน migration เองตอนเริ่ม)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 3) สร้าง admin คนแรก
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api node dist/cli/seed-admin.js
```

- เปิดสู่ภายนอกเฉพาะ nginx (80 → redirect, 443); api, web, postgres, redis อยู่ใน network ภายใน
- certbot ต่ออายุใบรับรองอัตโนมัติ และ nginx reload ทุก 6 ชั่วโมง
- ถ้า api ใน Docker ต้องต่อ ERP ในวง LAN ให้ใส่ IP / ชื่อเครื่อง ERP (ไม่ใช่ `localhost`)

### งานดูแลระบบ

| งาน | คำสั่ง / ที่ตั้งค่า |
| --- | --- |
| เปลี่ยน `MASTER_KEY` | `MASTER_KEY=<เดิม> NEW_MASTER_KEY=<ใหม่> node dist/cli/rotate-key.js` (ใน container api) แล้วแก้ `.env` และ restart api + worker |
| ระยะเก็บเนื้อหาเมล | `LOG_RETENTION_DAYS` (default 90 วัน) — เกินแล้วลบเนื้อหา คงสถานะไว้ |
| แจ้งเตือนเมลส่งไม่สำเร็จ | `DEAD_ALERT_INTERVAL_MIN` (default 15 นาที, ส่งถึง admin ทุกคน) |
| เพดานส่งต่อวัน | ตั้งต่อบัญชีในหน้า SMTP (Google Workspace ~2,000 ฉบับ/วัน) |
| ลบข้อมูลตามคำขอ PDPA | หน้า Audit & PDPA |
| Backup | `docker compose exec postgres pg_dump -U erpmail erpmail > backup.sql` |

## โครงสร้าง

| path              | หน้าที่                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| `apps/api`        | NestJS REST API + Prisma; worker entrypoint `src/worker.main.ts` (BullMQ jobs) |
| `apps/web`        | Next.js 14 Admin UI                                                          |
| `packages/shared` | DTO / zod schema / enum ที่ใช้ร่วมกัน                                           |
| `deploy/`         | nginx + certbot สำหรับ production                                             |
