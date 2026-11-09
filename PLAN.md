# PLAN.md — Milestone 5: Mail Queue + Worker

สถานะ: 🟢 M5 เสร็จ (2026-11-09) — ค้างทดสอบกับ ERP + Google Workspace จริง
ขอบเขต: sync ชนิด outbox (query PR/PO) → `mail_queue` (render ตอน enqueue), worker ส่งเมลผ่าน BullMQ พร้อม retry/backoff, daily limit, กู้คิวค้าง, แจ้งเตือน Admin เมื่อเมล DEAD, `mail_logs` ทุก event, หน้าเว็บตั้งค่า outbox
นอกขอบเขต M5: หน้า `/logs`, retry/cancel จากหน้าเว็บ, audit, archive (M6)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 5.2, 6; query: `docs/erp-queries/pr-po-pending-approval.sql`

## การตัดสินใจ (ผู้ใช้เลือก 2026-11-09)

- ส่งครั้งเดียวต่อ `(connection, erp_ref_id)` — query PR/PO ใช้ `erp_ref_id = doc_type:order_no:email` จึงได้ 1 เมลต่อ 1 เอกสารต่อ 1 ผู้รับ
- 1 เมลต่อ 1 เอกสาร (ไม่รวมเป็น digest)

## Tasks

### T1 — Prisma + shared
- [x] `erp_sync_configs.template_id`, `smtp_config_id` (FK, Restrict)
- [x] sync config DTO/create/update มี `templateId`, `smtpConfigId`; outbox ต้องมี template

### T2 — Outbox sync
- [x] `OutboxSyncService`: ต้องมี `erp_ref_id` + `to_email` (คั่นหลายคนด้วย `,` `;`), optional `cc`, `bcc`, `template_code`; ทุกคอลัมน์เป็นตัวแปร template
- [x] ข้ามแถวที่เคย enqueue แล้ว, render ตอน enqueue, log `QUEUED`; template/SMTP ที่ผูกกับ sync config ลบไม่ได้

### T3 — Delivery
- [x] `DeliveryService.process`: เช็ก daily limit (ตามวันใน `MAIL_TIMEZONE`) → claim → ส่ง → `SENT` / `FAILED` + backoff 1m, 5m, 30m, 2h, 8h / `DEAD` (5xx หรือครบ `SEND_MAX_ATTEMPTS`)
- [x] `recoverStuck`: `SENDING` เกิน `STUCK_SENDING_MIN` → `PENDING`
- [x] `DeadAlertService`: สรุปเมล DEAD ส่งให้ Admin ทุก `DEAD_ALERT_INTERVAL_MIN`

### T4 — Worker
- [x] BullMQ `mail-send`: tick ทุก `SEND_TICK_SEC` enqueue เมลที่ถึงเวลา, concurrency `SEND_CONCURRENCY`, rate `SEND_RATE_PER_SEC`
- [x] BullMQ `maintenance`: recover-stuck ทุก 1 นาที, dead-alert

### T5 — Web
- [x] หน้า `/sync` เพิ่มชนิด outbox: เลือก template + SMTP, ปุ่มใส่ query PR/PO ตัวอย่าง

### T6 — Integration test
- [x] e2e: ERP outbox (ตาราง fixture ใน Postgres test) → queue → sent ผ่าน SMTP จำลอง, รันซ้ำไม่ส่งซ้ำ
- [x] e2e: ปิด SMTP ชั่วคราว → `FAILED` + retry → เปิด SMTP → `SENT`; ผู้รับ 550 → `DEAD`; daily limit → เลื่อนไปวันถัดไป
- [x] e2e: worker (BullMQ + Redis จริง) ส่งเองครบวงจร

## QC Gate M5

- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [x] integration test end-to-end ผ่าน รวมกรณีปิด SMTP ชั่วคราว
- [x] `docker compose build` ผ่าน
- [ ] ผู้ใช้ทดสอบกับ ERP + Google Workspace จริง

## M5 Result

วันที่: 2026-11-09

### QC gate (output จริง)

```
$ pnpm lint
@erp-mail/web:lint: ✔ No ESLint warnings or errors
All matched files use Prettier code style!

$ pnpm typecheck
 Tasks:    4 successful, 4 total

$ pnpm test
@erp-mail/shared:test:       Tests  21 passed (21)
@erp-mail/api:test:       Tests  187 passed (187)
@erp-mail/web:test:       Tests  24 passed (24)

$ TEST_REDIS_URL=redis://localhost:6380/15 pnpm test:e2e
 ✓ test/mail-pipeline.e2e-spec.ts (5 tests)
 ✓ test/connections.e2e-spec.ts (8 tests)
 ✓ test/smtp-templates.e2e-spec.ts (4 tests)
 ✓ test/sync-contacts.e2e-spec.ts (5 tests)
 ✓ test/auth.e2e-spec.ts (9 tests)
 ✓ test/admin-users.e2e-spec.ts (7 tests)
 ✓ test/worker-mail.e2e-spec.ts (1 test)
 ✓ test/worker-sync.e2e-spec.ts (1 test)
 ✓ test/auth-throttle.e2e-spec.ts (1 test)
 Test Files  9 passed (9)
      Tests  41 passed (41)

$ docker compose build api web worker
 erp-mail-relay-api / worker / web built (2026-11-09 19:42–19:45)
```

Integration test (`mail-pipeline`, `worker-mail`):
- ERP outbox (ตาราง fixture รูปแบบเดียวกับ query PR/PO) → sync → 3 เมลเข้าคิว → ส่งครบ, log `QUEUED → SENDING → SENT`; sync ซ้ำ → `created 0, skipped 3` ไม่ส่งซ้ำ
- ปิด SMTP ชั่วคราว → `FAILED` attempt 1, retry +1 นาที; ก่อนถึงเวลาไม่ส่ง; เปิด SMTP → `SENT` attempt 2, log `QUEUED → SENDING → FAILED → SENDING → SENT`
- ผู้รับถูกปฏิเสธ 550 → `DEAD` ทันทีไม่ retry; เพดาน 2 ฉบับ/วัน → ฉบับที่ 3 เลื่อนไปวันถัดไป (ไม่นับ attempt); `SENDING` ค้าง > 10 นาที → กลับเป็น `PENDING`
- Worker จริง (BullMQ + Redis): ดึง outbox และส่งเองครบทั้ง 2 ฉบับ

### การตัดสินใจระหว่างทาง

- `erp_ref_id` ซ้ำกับที่เคยเข้าคิว = ข้าม (ส่งครั้งเดียวตามที่ผู้ใช้เลือก) แม้เอกสารยังค้างอนุมัติ
- **รอบแรกที่เปิดใช้งานจะส่งเมลของเอกสารที่รออนุมัติอยู่ทั้งหมดในตอนนั้น** — หน้า Sync แสดงคำเตือนและให้กด "ตรวจ query" ดูจำนวนก่อน
- ทุกคอลัมน์ของ query เป็นตัวแปร template; `to_email` / `cc` / `bcc` คั่นหลายคนด้วย `,` หรือ `;`; คอลัมน์ `template_code` (ถ้ามี) เลือก template ต่อแถว
- template ปิดใช้งาน / render ไม่ได้ → แถวนั้นไม่เข้าคิวและนับเป็น error (รอบถัดไปจะลองใหม่)
- `smtp_config_id` ว่าง = ใช้ SMTP ค่าเริ่มต้นตอนส่ง; ไม่มี SMTP เลย → เลื่อน 5 นาที
- เพดานรายวันนับตามวันใน `MAIL_TIMEZONE` (default Asia/Bangkok), ถึงเพดานแล้วเลื่อนไปเที่ยงคืนวันถัดไปโดยไม่นับเป็นความพยายามส่ง
- api และ worker รันด้วย `TZ=UTC` เพื่อให้วันที่จาก ERP (ไม่มีเขตเวลา) อ่านเป็นค่าตามที่บันทึกในทุก driver
- แจ้งเตือน Admin: สรุปเมล DEAD ทุก 15 นาที (เฉพาะเมลจาก ERP ไม่รวมส่งทดสอบ) ส่งถึง admin ที่ active ทุกคนผ่าน SMTP ค่าเริ่มต้น
- ลบ `SMTP_*` ออกจาก `.env.example` เพราะตั้งค่า SMTP ที่หน้าเว็บ

### Commit list M5

```
87e91e6 feat(web): configure outbox sync (template, SMTP, PR/PO starter query) on the sync page
1c3211c test(api): add end-to-end mail pipeline tests (outbox, retry, dead, daily limit, worker loop)
64e9920 fix(api): run api and worker in UTC so ERP datetimes are read as wall-clock values
93c0e3d feat(api): run mail sending and maintenance jobs in the worker with BullMQ
7e1b36f feat(api): add mail delivery with retry backoff, daily limit, stuck recovery and dead alerts
d4d72ab feat(api): enqueue rendered mails from outbox sync configs
b8751b4 feat(api): link outbox sync configs to a template and an SMTP config
ccc1c55 chore: archive M4 plan and add M5 mail queue and worker plan
```
