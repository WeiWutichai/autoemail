# PLAN.md — Milestone 6: Logs + Hardening

สถานะ: 🟡 กำลังทำ (เริ่ม 2026-11-09)
ขอบเขต: หน้า `/logs` (filter, drawer, Retry/Cancel) + dashboard, audit log, ลบเนื้อหาเมลเกิน 90 วัน, endpoint ลบข้อมูลตาม PDPA, เปลี่ยน MASTER_KEY, Nginx + HTTPS + README deploy, security review, load test 1,000 ฉบับ

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 5.5, 7, 8 (M6)

## Tasks

### T1 — Shared schemas
- [ ] `mails.ts` (summary, detail, logs, list query, stats), `audit.ts` (audit log, PDPA erase)

### T2 — Mails API
- [ ] `GET /mails` (status, connection, template, ช่วงวันที่, ค้นหาอีเมลผู้รับ / erp_ref_id / หัวเรื่อง), `GET /mails/:id` (timeline + เนื้อหา), `POST /mails/:id/retry` (FAILED/DEAD → PENDING), `POST /mails/:id/cancel` (PENDING/FAILED → CANCELLED), `GET /mails/stats`

### T3 — Audit log
- [ ] `@Audit()` + interceptor บันทึกหลังทำสำเร็จ (ตัดรหัสผ่าน, ตัดข้อความยาว), ใส่ใน connection / sync / SMTP / template / admin user / retry / cancel / PDPA; `GET /audit-logs`

### T4 — PDPA + retention
- [ ] `POST /pdpa/erase {email}`: ลบ contacts, ลบเนื้อหาและที่อยู่ในเมล, ยกเลิกเมลที่ยังไม่ส่ง
- [ ] worker job รายวัน: ลบเนื้อหาเมลที่จบแล้วและเก่ากว่า `LOG_RETENTION_DAYS` (คงแถวไว้เพื่อกันส่งซ้ำ)

### T5 — Hardening
- [ ] CLI `rotate-key` (re-encrypt รหัสผ่าน ERP/SMTP ด้วย key ใหม่)
- [ ] ปิด `x-powered-by`, `trust proxy` เฉพาะ private network
- [ ] `docker-compose.prod.yml` + nginx (HTTPS, HSTS, security headers) + certbot; README deploy

### T6 — Web
- [ ] หน้า `/logs`: dashboard (ส่งวันนี้ / ล้มเหลว / รอส่ง / DEAD / โควตา), filter, ตาราง, drawer (timeline, เนื้อหา, Retry/Cancel)
- [ ] หน้า `/audit`: audit log + ฟอร์มลบข้อมูล PDPA

### T7 — QC
- [ ] load test 1,000 ฉบับ (`pnpm --filter @erp-mail/api test:load`)
- [ ] security review ตาม DESIGN section 7
- [ ] ทดสอบทุกหน้าใน browser

## QC Gate M6

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [ ] security review ตาม section 7
- [ ] load test ส่ง 1,000 ฉบับ ไม่หาย ไม่ซ้ำ
- [ ] `docker compose build` ผ่าน, nginx config ผ่าน `nginx -t`
