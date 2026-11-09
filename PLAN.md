# PLAN.md — Milestone 3: Sync รายชื่อ

สถานะ: 🟢 M3 เสร็จ (2026-11-09) — ค้างทดสอบกับ ERP จริง
ขอบเขต: ตั้งค่าการดึงข้อมูล (sync config) ต่อ connection, ดึงรายชื่อ (contacts) จาก ERP มา upsert, หน้า `/sync` และ `/contacts`, worker process ที่รัน sync ตามรอบ
นอกขอบเขต M3: template / SMTP (M4), outbox → mail_queue / send job (M5), logs / audit (M6)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 4, 5.2, 5.3, 6; แผน M1/M2 อยู่ที่ `docs/milestones/`

## การตัดสินใจ (ผู้ใช้เลือก 2026-11-09)

- ทำ M3 → M6 ต่อเนื่องโดยไม่หยุดรอ review ระหว่าง milestone (ยังบันทึก QC gate ทุก milestone)
- Worker อยู่ใน `apps/api` เป็น entrypoint ที่สอง (`dist/worker.main.js`) ใช้ service ร่วมกับ api แล้วลบ `apps/worker` — docker-compose ใช้ image ของ api รันคนละคำสั่ง
- PR/PO ส่งครั้งเดียวต่อ (เอกสาร + อีเมล), 1 เมลต่อ 1 เอกสาร (ใช้ใน M5)

## Tasks

### T1 — Worker entrypoint ใน api
- [x] `apps/api/src/worker.main.ts` + `worker/worker.module.ts` (Config, Logger, Prisma, Crypto, Erp, BullMQ)
- [x] env ของ worker: `REDIS_URL`, `SYNC_TICK_SEC`
- [x] ลบ `apps/worker`, docker-compose `worker` ใช้ image api + `node dist/worker.main.js`, `pnpm dev` รัน worker ด้วย

### T2 — Prisma: ผลการ sync
- [x] `erp_sync_configs` เพิ่ม `name`, `last_result` (json: fetched/created/updated/skipped/errors), `last_error`

### T3 — Shared schemas
- [x] `syncConfigSchema`, create/update (SQL ผ่าน validator ฝั่ง api), `syncRunResultSchema`, `queryPreviewSchema`, `contactSchema`, `contactListQuerySchema`

### T4 — ERP query runner
- [x] `ErpDataSourceFactory.query(conn, sql)` คืน rows ที่ normalize แล้ว (pg/mysql/mssql/oracle, key เป็นตัวเล็ก, ค่าเป็น JSON-safe)
- [x] ตรวจ `SqlValidator` ก่อน execute ทุกครั้ง

### T5 — Sync configs API + contact sync
- [x] `GET/POST/PATCH/DELETE /sync-configs`, `POST /sync-configs/preview` (รัน query แล้วคืน column + 20 แถวแรก + column ที่ขาด), `POST /sync-configs/:id/run`
- [x] `ContactSyncService`: ต้องมี `erp_ref_id` + `email`, optional `name`/`phone`/`company`, ที่เหลือเก็บใน `raw`; upsert ด้วย `(connection_id, erp_ref_id)`; บันทึก `last_synced_at` + `last_result`
- [x] unit test + e2e (ERP = Postgres test)

### T6 — Contacts API
- [x] `GET /contacts?connectionId&q&page&pageSize` ค้นหา ชื่อ / email / บริษัท

### T7 — Worker: sync ตามรอบ
- [x] BullMQ queue `sync`: tick ทุก `SYNC_TICK_SEC` หา config ที่ถึงรอบ (`poll_interval_sec`) แล้ว enqueue (jobId กันซ้ำ), worker concurrency 1

### T8 — Web
- [x] หน้า `/sync`: ตาราง sync config, ฟอร์มเพิ่ม/แก้ (เลือก connection, ชนิด, SQL, รอบเวลา), ปุ่ม "ตรวจ query" (preview) และ "Sync now"
- [x] หน้า `/contacts`: ตารางรายชื่อ + ค้นหา + filter connection + แบ่งหน้า

## QC Gate M3

- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [x] sync รายชื่อจาก "ERP" (Postgres test) ได้ และรันซ้ำไม่สร้างซ้ำ (e2e)
- [x] `docker compose build` ผ่าน
- [ ] ผู้ใช้ sync รายชื่อจาก ERP จริง (ค้างจาก M2: ต้องมี connection จริงก่อน)

## M3 Result

วันที่: 2026-11-09

### QC gate (output จริง)

```
$ pnpm lint
@erp-mail/web:lint: ✔ No ESLint warnings or errors
All matched files use Prettier code style!

$ pnpm typecheck
 Tasks:    4 successful, 4 total

$ pnpm test
@erp-mail/api:test:       Tests  138 passed (138)
@erp-mail/shared:test:       Tests  16 passed (16)
@erp-mail/web:test:       Tests  16 passed (16)

$ TEST_REDIS_URL=redis://localhost:6380/15 pnpm test:e2e
 ✓ test/connections.e2e-spec.ts (8 tests)
 ✓ test/sync-contacts.e2e-spec.ts (5 tests)
 ✓ test/auth.e2e-spec.ts (9 tests)
 ✓ test/admin-users.e2e-spec.ts (7 tests)
 ✓ test/worker-sync.e2e-spec.ts (1 test)
 ✓ test/auth-throttle.e2e-spec.ts (1 test)
 Test Files  6 passed (6)
      Tests  31 passed (31)

$ docker compose build api web worker
 Image erp-mail-relay-worker Built
 Image erp-mail-relay-api Built
 Image erp-mail-relay-web Built
```

- e2e `sync-contacts`: sync ครั้งแรก created 2 / errors 1 (อีเมลผิดรูปแบบ), รันซ้ำ created 0 / updated 2 → ไม่สร้างซ้ำ
- e2e `worker-sync`: worker (BullMQ + Redis จริง) ดึง config ที่ถึงรอบเองภายในไม่กี่วินาที

### การตัดสินใจระหว่างทาง

- ชื่อคอลัมน์จาก ERP แปลงเป็นตัวเล็กทั้งหมด (Oracle คืนตัวใหญ่) — query ต้องตั้ง alias `erp_ref_id`, `email` หรือใช้ column mapping (`email=Z_Email`)
- ค่าวันที่จาก ERP เก็บเป็น ISO string, Buffer ทิ้ง, bigint เป็น string
- แถวที่ไม่มี `erp_ref_id` หรืออีเมลผิดรูปแบบ → ข้ามและนับเป็น error; ข้อความ error อ้างอิงแค่เลขแถว / erp_ref_id ไม่มีข้อมูลส่วนตัวอื่น
- รันไม่สำเร็จก็ยังบันทึก `last_synced_at` เพื่อไม่ให้ worker ยิง ERP ซ้ำทุก tick
- "Sync now" รันใน api process ทันที (ไม่ผ่าน queue) เพื่อตอบผลกลับหน้าเว็บได้เลย; การเขียนเป็น idempotent จึงไม่เสียหายถ้าชนกับ worker
- `SYNC_TICK_SEC` (default 30) คือความถี่ตรวจหา config ที่ถึงรอบ ไม่ใช่รอบดึงข้อมูล (รอบดึงตั้งต่อ config ขั้นต่ำ 1 นาที)
- e2e ต้องมี Redis — ใช้ `TEST_REDIS_URL` (default `redis://localhost:6379/15`)

### Commit list M3

```
9702abf feat(web): add sync config and contacts pages
d689fe3 feat(api): schedule contact sync in the worker with BullMQ
7405afb feat(api): add sync configs CRUD, query preview and contact sync
4b7d2c1 feat(api): add contacts list endpoint with search and pagination
88d88f5 feat(api): add validated ERP query runner with per-driver row normalization
cab03dd feat(shared): add sync config, contact and pagination schemas
16ffbd5 feat(api): add name, last_result and last_error to erp_sync_configs
8752f1e chore: move worker into api as a second entrypoint and drop apps/worker
33522cc chore: archive M2 plan and add M3 contact sync plan
```
