# PLAN.md — Milestone 5: Mail Queue + Worker

สถานะ: 🟡 กำลังทำ (เริ่ม 2026-11-09)
ขอบเขต: sync ชนิด outbox (query PR/PO) → `mail_queue` (render ตอน enqueue), worker ส่งเมลผ่าน BullMQ พร้อม retry/backoff, daily limit, กู้คิวค้าง, แจ้งเตือน Admin เมื่อเมล DEAD, `mail_logs` ทุก event, หน้าเว็บตั้งค่า outbox
นอกขอบเขต M5: หน้า `/logs`, retry/cancel จากหน้าเว็บ, audit, archive (M6)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 5.2, 6; query: `docs/erp-queries/pr-po-pending-approval.sql`

## การตัดสินใจ (ผู้ใช้เลือก 2026-11-09)

- ส่งครั้งเดียวต่อ `(connection, erp_ref_id)` — query PR/PO ใช้ `erp_ref_id = doc_type:order_no:email` จึงได้ 1 เมลต่อ 1 เอกสารต่อ 1 ผู้รับ
- 1 เมลต่อ 1 เอกสาร (ไม่รวมเป็น digest)

## Tasks

### T1 — Prisma + shared
- [ ] `erp_sync_configs.template_id`, `smtp_config_id` (FK, Restrict)
- [ ] sync config DTO/create/update มี `templateId`, `smtpConfigId`; outbox ต้องมี template

### T2 — Outbox sync
- [ ] `OutboxSyncService`: ต้องมี `erp_ref_id` + `to_email` (คั่นหลายคนด้วย `,` `;`), optional `cc`, `bcc`, `template_code`; ทุกคอลัมน์เป็นตัวแปร template
- [ ] ข้ามแถวที่เคย enqueue แล้ว, render ตอน enqueue, log `QUEUED`; template/SMTP ที่ผูกกับ sync config ลบไม่ได้

### T3 — Delivery
- [ ] `DeliveryService.process`: เช็ก daily limit (ตามวันใน `MAIL_TIMEZONE`) → claim → ส่ง → `SENT` / `FAILED` + backoff 1m, 5m, 30m, 2h, 8h / `DEAD` (5xx หรือครบ `SEND_MAX_ATTEMPTS`)
- [ ] `recoverStuck`: `SENDING` เกิน `STUCK_SENDING_MIN` → `PENDING`
- [ ] `DeadAlertService`: สรุปเมล DEAD ส่งให้ Admin ทุก `DEAD_ALERT_INTERVAL_MIN`

### T4 — Worker
- [ ] BullMQ `mail-send`: tick ทุก `SEND_TICK_SEC` enqueue เมลที่ถึงเวลา, concurrency `SEND_CONCURRENCY`, rate `SEND_RATE_PER_SEC`
- [ ] BullMQ `maintenance`: recover-stuck ทุก 1 นาที, dead-alert

### T5 — Web
- [ ] หน้า `/sync` เพิ่มชนิด outbox: เลือก template + SMTP, ปุ่มใส่ query PR/PO ตัวอย่าง

### T6 — Integration test
- [ ] e2e: ERP outbox (ตาราง fixture ใน Postgres test) → queue → sent ผ่าน SMTP จำลอง, รันซ้ำไม่ส่งซ้ำ
- [ ] e2e: ปิด SMTP ชั่วคราว → `FAILED` + retry → เปิด SMTP → `SENT`; ผู้รับ 550 → `DEAD`; daily limit → เลื่อนไปวันถัดไป
- [ ] e2e: worker (BullMQ + Redis จริง) ส่งเองครบวงจร

## QC Gate M5

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [ ] integration test end-to-end ผ่าน รวมกรณีปิด SMTP ชั่วคราว
- [ ] `docker compose build` ผ่าน
- [ ] ผู้ใช้ทดสอบกับ ERP + Google Workspace จริง
