# PLAN.md — Milestone 3: Sync รายชื่อ

สถานะ: 🟡 กำลังทำ (เริ่ม 2026-11-09)
ขอบเขต: ตั้งค่าการดึงข้อมูล (sync config) ต่อ connection, ดึงรายชื่อ (contacts) จาก ERP มา upsert, หน้า `/sync` และ `/contacts`, worker process ที่รัน sync ตามรอบ
นอกขอบเขต M3: template / SMTP (M4), outbox → mail_queue / send job (M5), logs / audit (M6)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 4, 5.2, 5.3, 6; แผน M1/M2 อยู่ที่ `docs/milestones/`

## การตัดสินใจ (ผู้ใช้เลือก 2026-11-09)

- ทำ M3 → M6 ต่อเนื่องโดยไม่หยุดรอ review ระหว่าง milestone (ยังบันทึก QC gate ทุก milestone)
- Worker อยู่ใน `apps/api` เป็น entrypoint ที่สอง (`dist/worker.main.js`) ใช้ service ร่วมกับ api แล้วลบ `apps/worker` — docker-compose ใช้ image ของ api รันคนละคำสั่ง
- PR/PO ส่งครั้งเดียวต่อ (เอกสาร + อีเมล), 1 เมลต่อ 1 เอกสาร (ใช้ใน M5)

## Tasks

### T1 — Worker entrypoint ใน api
- [ ] `apps/api/src/worker.main.ts` + `worker/worker.module.ts` (Config, Logger, Prisma, Crypto, Erp, BullMQ)
- [ ] env ของ worker: `REDIS_URL`, `SYNC_TICK_SEC`
- [ ] ลบ `apps/worker`, docker-compose `worker` ใช้ image api + `node dist/worker.main.js`, `pnpm dev` รัน worker ด้วย

### T2 — Prisma: ผลการ sync
- [ ] `erp_sync_configs` เพิ่ม `name`, `last_result` (json: fetched/created/updated/skipped/errors), `last_error`

### T3 — Shared schemas
- [ ] `syncConfigSchema`, create/update (SQL ผ่าน validator ฝั่ง api), `syncRunResultSchema`, `queryPreviewSchema`, `contactSchema`, `contactListQuerySchema`

### T4 — ERP query runner
- [ ] `ErpDataSourceFactory.query(conn, sql)` คืน rows ที่ normalize แล้ว (pg/mysql/mssql/oracle, key เป็นตัวเล็ก, ค่าเป็น JSON-safe)
- [ ] ตรวจ `SqlValidator` ก่อน execute ทุกครั้ง

### T5 — Sync configs API + contact sync
- [ ] `GET/POST/PATCH/DELETE /sync-configs`, `POST /sync-configs/preview` (รัน query แล้วคืน column + 20 แถวแรก + column ที่ขาด), `POST /sync-configs/:id/run`
- [ ] `ContactSyncService`: ต้องมี `erp_ref_id` + `email`, optional `name`/`phone`/`company`, ที่เหลือเก็บใน `raw`; upsert ด้วย `(connection_id, erp_ref_id)`; บันทึก `last_synced_at` + `last_result`
- [ ] unit test + e2e (ERP = Postgres test)

### T6 — Contacts API
- [ ] `GET /contacts?connectionId&q&page&pageSize` ค้นหา ชื่อ / email / บริษัท

### T7 — Worker: sync ตามรอบ
- [ ] BullMQ queue `sync`: tick ทุก `SYNC_TICK_SEC` หา config ที่ถึงรอบ (`poll_interval_sec`) แล้ว enqueue (jobId กันซ้ำ), worker concurrency 1

### T8 — Web
- [ ] หน้า `/sync`: ตาราง sync config, ฟอร์มเพิ่ม/แก้ (เลือก connection, ชนิด, SQL, รอบเวลา), ปุ่ม "ตรวจ query" (preview) และ "Sync now"
- [ ] หน้า `/contacts`: ตารางรายชื่อ + ค้นหา + filter connection + แบ่งหน้า

## QC Gate M3

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [ ] sync รายชื่อจาก "ERP" (Postgres test) ได้ และรันซ้ำไม่สร้างซ้ำ (e2e)
- [ ] `docker compose build` ผ่าน
- [ ] ผู้ใช้ sync รายชื่อจาก ERP จริง (ค้างจาก M2: ต้องมี connection จริงก่อน)
