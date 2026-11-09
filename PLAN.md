# PLAN.md — Milestone 6: Logs + Hardening

สถานะ: 🟢 M6 เสร็จ (2026-11-09) — ทุก milestone เสร็จ; ค้างทดสอบกับ ERP + Google Workspace จริงและ deploy จริง
ขอบเขต: หน้า `/logs` (filter, drawer, Retry/Cancel) + dashboard, audit log, ลบเนื้อหาเมลเกิน 90 วัน, endpoint ลบข้อมูลตาม PDPA, เปลี่ยน MASTER_KEY, Nginx + HTTPS + README deploy, security review, load test 1,000 ฉบับ

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 5.5, 7, 8 (M6)

## Tasks

### T1 — Shared schemas
- [x] `mails.ts` (summary, detail, logs, list query, stats), `audit.ts` (audit log, PDPA erase)

### T2 — Mails API
- [x] `GET /mails` (status, connection, template, ช่วงวันที่, ค้นหาอีเมลผู้รับ / erp_ref_id / หัวเรื่อง), `GET /mails/:id` (timeline + เนื้อหา), `POST /mails/:id/retry` (FAILED/DEAD → PENDING), `POST /mails/:id/cancel` (PENDING/FAILED → CANCELLED), `GET /mails/stats`

### T3 — Audit log
- [x] `@Audit()` + interceptor บันทึกหลังทำสำเร็จ (ตัดรหัสผ่าน, ตัดข้อความยาว), ใส่ใน connection / sync / SMTP / template / admin user / retry / cancel / PDPA; `GET /audit-logs`

### T4 — PDPA + retention
- [x] `POST /pdpa/erase {email}`: ลบ contacts, ลบเนื้อหาและที่อยู่ในเมล, ยกเลิกเมลที่ยังไม่ส่ง
- [x] worker job รายวัน: ลบเนื้อหาเมลที่จบแล้วและเก่ากว่า `LOG_RETENTION_DAYS` (คงแถวไว้เพื่อกันส่งซ้ำ)

### T5 — Hardening
- [x] CLI `rotate-key` (re-encrypt รหัสผ่าน ERP/SMTP ด้วย key ใหม่)
- [x] ปิด `x-powered-by`, `trust proxy` เฉพาะ private network
- [x] `docker-compose.prod.yml` + nginx (HTTPS, HSTS, security headers) + certbot; README deploy

### T6 — Web
- [x] หน้า `/logs`: dashboard (ส่งวันนี้ / ล้มเหลว / รอส่ง / DEAD / โควตา), filter, ตาราง, drawer (timeline, เนื้อหา, Retry/Cancel)
- [x] หน้า `/audit`: audit log + ฟอร์มลบข้อมูล PDPA

### T7 — QC
- [x] load test 1,000 ฉบับ (`pnpm --filter @erp-mail/api test:load`)
- [x] security review ตาม DESIGN section 7
- [x] ทดสอบทุกหน้าใน browser

## QC Gate M6

- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [x] security review ตาม section 7
- [x] load test ส่ง 1,000 ฉบับ ไม่หาย ไม่ซ้ำ
- [x] `docker compose build` ผ่าน, nginx config ผ่าน `nginx -t`

## M6 Result

วันที่: 2026-11-09

### QC gate (output จริง)

```
$ pnpm lint
@erp-mail/web:lint: ✔ No ESLint warnings or errors
All matched files use Prettier code style!

$ pnpm typecheck
 Tasks:    4 successful, 4 total

$ pnpm test
@erp-mail/shared:test:       Tests  24 passed (24)
@erp-mail/web:test:       Tests  26 passed (26)
@erp-mail/api:test:       Tests  199 passed (199)

$ TEST_REDIS_URL=redis://localhost:6380/15 pnpm test:e2e
 ✓ test/mail-pipeline.e2e-spec.ts (5 tests)
 ✓ test/connections.e2e-spec.ts (8 tests)
 ✓ test/logs-audit.e2e-spec.ts (5 tests)
 ✓ test/smtp-templates.e2e-spec.ts (4 tests)
 ✓ test/sync-contacts.e2e-spec.ts (5 tests)
 ✓ test/auth.e2e-spec.ts (9 tests)
 ✓ test/admin-users.e2e-spec.ts (7 tests)
 ✓ test/worker-mail.e2e-spec.ts (1 test)
 ✓ test/worker-sync.e2e-spec.ts (1 test)
 ✓ test/auth-throttle.e2e-spec.ts (1 test)
 Test Files  10 passed (10)
      Tests  46 passed (46)

$ pnpm --filter @erp-mail/api test:load
[load] 1000 mails: enqueued in 35.9s, all sent in 40.1s (SEND_CONCURRENCY=4, SEND_RATE_PER_SEC=100)
 ✓ Load: 1000 mails end-to-end > enqueues and delivers every mail exactly once
      Tests  1 passed (1)

$ docker compose build api web worker
 Image erp-mail-relay-worker Built
 Image erp-mail-relay-api Built
 Image erp-mail-relay-web Built

$ nginx -t   (template rendered with DOMAIN=mail.example.com + self-signed cert, nginx:1.27-alpine)
nginx: configuration file /etc/nginx/nginx.conf test is successful

$ docker compose -f docker-compose.yml -f docker-compose.prod.yml config
 published ports: 80, 443 only (nginx)
```

- Load test: 1,000 แถวจาก ERP fixture → 1,000 เมล ผ่าน BullMQ + SMTP จำลอง ส่งครบ ผู้รับไม่ซ้ำ ไม่มี error
  (ค่า production `SEND_RATE_PER_SEC=1` → 1,000 ฉบับใช้ประมาณ 17 นาที และ Google Workspace จำกัด ~2,000 ฉบับ/วัน)

### Browser QA (Chrome, api :3201 + worker + web :3200 → ฐาน `erpmail_test`, SMTP จำลอง :2525, ข้อมูล QA ลบแล้ว)

- login → สร้าง template จากตัวอย่าง PR/PO (preview สด ปี พ.ศ. ถูก) → หน้า Sync สร้าง outbox, "ตรวจ query" ได้ 3 แถว คอลัมน์ครบ → บันทึก
- worker ดึงและส่งเองภายในไม่กี่วินาที: Logs แสดง 3 ฉบับ "ส่งแล้ว", dashboard ส่งวันนี้ 3, โควตา 3 / 2,000; drawer แสดง timeline เข้าคิว → เริ่มส่ง → ส่งสำเร็จ (250 OK) และเนื้อหา HTML
- Audit & PDPA แสดง connection / smtp / template / sync_config create พร้อมข้อมูลที่ส่ง (รหัสผ่านเป็น `***`)
- **บั๊กที่เจอและแก้แล้ว**:
  - สีธีม Tailwind ใช้ `hsl(var(--x))` กับตัวแปร oklch → พื้นหลัง dialog โปร่งใส ปุ่ม/badge ไม่มีสี (มีมาตั้งแต่ M1) → `92802c2`
  - ตาราง preview กว้างดัน dialog Sync จนปุ่มบันทึกหลุดขอบ, toast มุมขวาบนบังปุ่มหลักของหน้า → `e5a28f4`

### Security review (DESIGN section 7)

| ข้อ | ผล |
| --- | --- |
| รหัสผ่าน ERP / SMTP เข้ารหัส AES-256-GCM, key จาก env, หมุน key ได้ | ✅ `CryptoService`, CLI `rotate-key` (re-encrypt ใน transaction เดียว, ล้มทั้งชุดถ้าถอดรหัสไม่ได้) |
| SQL ของ Admin: SELECT เท่านั้น, ห้าม `;` `INTO` `EXEC` `xp_` | ✅ `SqlValidator` ตรวจตอนบันทึกและก่อน execute ทุกครั้ง (`ErpDataSourceFactory.query`); raw SQL อื่นมีแค่ ping คงที่ |
| ERP timeout 10 วินาที, ไม่เกิน 2 connection ต่อ ERP | ✅ `ERP_QUERY_TIMEOUT_MS`, `ERP_MAX_CONNECTIONS` |
| ทุก route หลัง JWT ยกเว้น `/auth/*` และ `/health` | ✅ ตรวจ `@Public` + e2e ทุก endpoint ไม่มี token → 401 |
| Audit log สร้าง/แก้ connection, template, retry, cancel | ✅ + sync, SMTP, admin user, PDPA; ตัด field รหัสผ่าน/secret/token |
| PDPA: เก็บเนื้อหาเมล 90 วัน, endpoint ลบตามอีเมล, ไม่ log เนื้อหาเมล | ✅ job รายวัน, `POST /pdpa/erase`, log มีแค่ id / จำนวน (ตรวจด้วย grep) |
| ไฟล์แนบนอก web root | ➖ ไม่มีไฟล์แนบ (ผู้ใช้ยืนยัน) |
| HTTPS, CORS เฉพาะโดเมน admin | ✅ nginx + Let's Encrypt, HSTS / nosniff / X-Frame-Options DENY; CORS = `WEB_URL`; api/web/db ไม่เปิดสู่ภายนอก |
| ไม่มี secret ใน git, API ไม่คืน `passwordEnc` | ✅ มีแค่ `.env.example`; DTO ใช้ `hasPassword` (ตรวจใน e2e) |
| อื่น ๆ | ปิด `x-powered-by`; `trust proxy` เฉพาะ private network (IP ใน audit / rate limit ถูกต้องหลัง nginx); refresh cookie `httpOnly; Secure; SameSite=Strict` |

ข้อที่ควรทำต่อ (ไม่ได้ทำใน M6): ยังไม่ได้รัน `pnpm audit` (เน็ตช้าระหว่างทำงาน), ยังไม่มี CSP header

### การตัดสินใจระหว่างทาง

- Retention / PDPA ลบเฉพาะเนื้อหา (HTML, text, ตัวแปร, ที่อยู่ผู้รับ) แต่ **คงแถว `mail_queue` ไว้** เพื่อไม่ให้ระบบส่งเอกสารเดิมซ้ำ — `erp_ref_id` ของ query PR/PO มีอีเมลอยู่ จึงยังคงอยู่ในแถว (ระบุไว้ในหน้าเว็บว่าควรลบที่ ERP ด้วย)
- PDPA erase ยกเลิกเมลที่ยังไม่ส่งของอีเมลนั้น
- Retry จากหน้าเว็บรีเซ็ตจำนวนครั้งเป็น 0 (ได้โควตาลองใหม่ครบ 5 ครั้ง)
- "ส่งล้มเหลววันนี้" นับจำนวนครั้งที่ส่งล้มเหลว (event FAILED) ไม่ใช่จำนวนฉบับ
- Audit บันทึกผ่าน decorator `@Audit()` + interceptor หลังทำสำเร็จเท่านั้น; การเขียน audit ล้มเหลวไม่ทำให้คำสั่งของ admin ล้มเหลว
- Deploy: overlay `docker-compose.prod.yml` (ใช้ `!reset` ต้องมี Docker Compose ≥ 2.24); certbot ต่ออายุทุก 12 ชม., nginx reload ทุก 6 ชม.

### Commit list M6

```
e5a28f4 fix(web): keep wide query previews inside the sync dialog and show toasts bottom-right
92802c2 fix(web): make Tailwind theme colors work with the oklch CSS variables
1a1d051 feat(web): add logs page with dashboard, mail drawer and retry/cancel, and audit/PDPA page
b0a382e test(api): add 1,000-mail end-to-end load test
49cdec2 feat: add HTTPS deploy (nginx + certbot), MASTER_KEY rotation CLI and HTTP hardening
c355ed2 feat(api): record admin actions in the audit log without secrets
e968450 feat(api): add PDPA erase endpoint and daily retention of mail content
c2ea634 feat(api): add mail log list, detail, retry, cancel and dashboard stats endpoints
bf06dda feat(shared): add mail log, dashboard, audit and PDPA schemas
2ca062e chore: archive M5 plan and add M6 logs and hardening plan
```

## สิ่งที่ผู้ใช้ต้องทำเอง (ค้างจากทุก milestone)

1. สร้าง `.env` จาก `.env.example` (secret ทั้งหมด)
2. เพิ่ม connection SQL Server ของ ERP จริงที่หน้า Connections แล้วกด "ทดสอบ" (M2)
3. เพิ่ม SMTP Google Workspace + App Password แล้ว "ส่งเมลทดสอบ" ถึงกล่องจริง (M4)
4. สร้าง template, ตั้งค่า Sync outbox ด้วย query PR/PO แล้วกด "ตรวจ query" ดูจำนวนเอกสารก่อนเปิดใช้งาน — รอบแรกจะส่งทุกเอกสารที่รออนุมัติอยู่ (M5)
5. Deploy ตาม README (DNS + certbot) (M6)
