# PLAN.md — Milestone 4: Templates + SMTP

สถานะ: 🟡 กำลังทำ (เริ่ม 2026-11-09)
ขอบเขต: ตั้งค่า SMTP (Google Workspace App Password) + ปุ่มทดสอบ, template อีเมล (Handlebars) + version + preview + ส่งทดสอบ, ส่งทดสอบถึงรายชื่อจากหน้า contacts
นอกขอบเขต M4: outbox → mail_queue, send job, retry (M5); หน้า logs (M6)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 4, 5.4, 6, 7; แผนก่อนหน้าอยู่ที่ `docs/milestones/`

## Tasks

### T1 — Shared schemas
- [ ] `smtp.ts` (DTO มี `hasPassword`, create/update, test), `templates.ts` (DTO, create/update, render, test send, version)

### T2 — Prisma
- [ ] ตาราง `mail_template_versions` (template_id, version, subject/html/text) unique `(template_id, version)`
- [ ] `smtp_configs` เพิ่ม `last_test_at`, `last_test_ok`

### T3 — Mail core (ใช้ร่วม api + worker)
- [ ] `TemplateRenderer`: Handlebars, subject/text ไม่ escape, HTML escape, helper `formatDate`, `formatNumber`, `default`; ตรวจ syntax ตอนบันทึก; สร้าง text จาก HTML ถ้าไม่มี text template
- [ ] `MailerService`: Nodemailer transport ต่อ SMTP config (cache ตาม `updatedAt`), `verify`, `send`, จัดประเภท error (5xx ถาวร / 4xx, timeout, auth = ชั่วคราว), ตัดรหัสผ่านออกจากข้อความ error

### T4 — SMTP API
- [ ] `GET/POST/PATCH/DELETE /smtp-configs`, `POST /smtp-configs/:id/test` (verify + ส่งเมลทดสอบถ้าระบุผู้รับ)
- [ ] default ได้ตัวเดียว, ลบไม่ได้ถ้ามีเมลอ้างอิง (409 `SMTP_IN_USE`)

### T5 — Templates API
- [ ] `GET/POST/PATCH/DELETE /templates`, `GET /templates/:id/versions`, `POST /templates/preview`, `POST /templates/:id/test-send`
- [ ] แก้ subject/body → version + 1 และเก็บ snapshot; ส่งทดสอบบันทึกลง `mail_queue` + `mail_logs` (ไม่มี connection)

### T6 — Web
- [ ] หน้า `/smtp`: ตาราง + ฟอร์ม (ค่าเริ่มต้น smtp.gmail.com:587) + ทดสอบ
- [ ] หน้า `/templates` + editor (`/templates/new`, `/templates/[id]`): ฟอร์ม, preview สด, ข้อมูลตัวอย่าง (JSON), ส่งทดสอบ, ประวัติ version
- [ ] หน้า `/contacts`: ปุ่ม "ส่งทดสอบ" ต่อรายชื่อ (เลือก template)

## QC Gate M4

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [ ] e2e ส่งเมลทดสอบผ่าน SMTP server จำลอง (smtp-server) แล้วได้ message id + log
- [ ] `docker compose build` ผ่าน
- [ ] ผู้ใช้ส่งเมลทดสอบผ่าน Google Workspace ถึงกล่องจริง (ต้องใช้ App Password ของผู้ใช้)
