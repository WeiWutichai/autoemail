# PLAN.md — Milestone 4: Templates + SMTP

สถานะ: 🟢 M4 เสร็จ (2026-11-09) — ค้างทดสอบส่งผ่าน Google Workspace จริง
ขอบเขต: ตั้งค่า SMTP (Google Workspace App Password) + ปุ่มทดสอบ, template อีเมล (Handlebars) + version + preview + ส่งทดสอบ, ส่งทดสอบถึงรายชื่อจากหน้า contacts
นอกขอบเขต M4: outbox → mail_queue, send job, retry (M5); หน้า logs (M6)

อ้างอิง: `CLAUDE.md`, `docs/DESIGN.md` section 4, 5.4, 6, 7; แผนก่อนหน้าอยู่ที่ `docs/milestones/`

## Tasks

### T1 — Shared schemas
- [x] `smtp.ts` (DTO มี `hasPassword`, create/update, test), `templates.ts` (DTO, create/update, render, test send, version)

### T2 — Prisma
- [x] ตาราง `mail_template_versions` (template_id, version, subject/html/text) unique `(template_id, version)`
- [x] `smtp_configs` เพิ่ม `last_test_at`, `last_test_ok`

### T3 — Mail core (ใช้ร่วม api + worker)
- [x] `TemplateRenderer`: Handlebars, subject/text ไม่ escape, HTML escape, helper `formatDate`, `formatNumber`, `default`; ตรวจ syntax ตอนบันทึก; สร้าง text จาก HTML ถ้าไม่มี text template
- [x] `MailerService`: Nodemailer transport ต่อ SMTP config (cache ตาม `updatedAt`), `verify`, `send`, จัดประเภท error (5xx ถาวร / 4xx, timeout, auth = ชั่วคราว), ตัดรหัสผ่านออกจากข้อความ error

### T4 — SMTP API
- [x] `GET/POST/PATCH/DELETE /smtp-configs`, `POST /smtp-configs/:id/test` (verify + ส่งเมลทดสอบถ้าระบุผู้รับ)
- [x] default ได้ตัวเดียว, ลบไม่ได้ถ้ามีเมลอ้างอิง (409 `SMTP_IN_USE`)

### T5 — Templates API
- [x] `GET/POST/PATCH/DELETE /templates`, `GET /templates/:id/versions`, `POST /templates/preview`, `POST /templates/:id/test-send`
- [x] แก้ subject/body → version + 1 และเก็บ snapshot; ส่งทดสอบบันทึกลง `mail_queue` + `mail_logs` (ไม่มี connection)

### T6 — Web
- [x] หน้า `/smtp`: ตาราง + ฟอร์ม (ค่าเริ่มต้น smtp.gmail.com:587) + ทดสอบ
- [x] หน้า `/templates` + editor (`/templates/new`, `/templates/[id]`): ฟอร์ม, preview สด, ข้อมูลตัวอย่าง (JSON), ส่งทดสอบ, ประวัติ version
- [x] หน้า `/contacts`: ปุ่ม "ส่งทดสอบ" ต่อรายชื่อ (เลือก template)

## QC Gate M4

- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` ผ่าน
- [x] e2e ส่งเมลทดสอบผ่าน SMTP server จำลอง (smtp-server) แล้วได้ message id + log
- [x] `docker compose build` ผ่าน
- [ ] ผู้ใช้ส่งเมลทดสอบผ่าน Google Workspace ถึงกล่องจริง (ต้องใช้ App Password ของผู้ใช้)

## M4 Result

วันที่: 2026-11-09

### QC gate (output จริง)

```
$ pnpm lint
@erp-mail/web:lint: ✔ No ESLint warnings or errors
All matched files use Prettier code style!

$ pnpm typecheck
 Tasks:    4 successful, 4 total

$ pnpm test
@erp-mail/shared:test:       Tests  20 passed (20)
@erp-mail/api:test:       Tests  166 passed (166)
@erp-mail/web:test:       Tests  22 passed (22)

$ TEST_REDIS_URL=redis://localhost:6380/15 pnpm test:e2e
 ✓ test/connections.e2e-spec.ts (8 tests)
 ✓ test/smtp-templates.e2e-spec.ts (4 tests)
 ✓ test/sync-contacts.e2e-spec.ts (5 tests)
 ✓ test/auth.e2e-spec.ts (9 tests)
 ✓ test/admin-users.e2e-spec.ts (7 tests)
 ✓ test/worker-sync.e2e-spec.ts (1 test)
 ✓ test/auth-throttle.e2e-spec.ts (1 test)
 Test Files  7 passed (7)
      Tests  35 passed (35)

$ pnpm --filter @erp-mail/web build
 ✓ Compiled successfully   (/smtp, /templates, /templates/new, /templates/[id])

$ docker compose build api web worker
 Image erp-mail-relay-api Built
 Image erp-mail-relay-web Built
 Image erp-mail-relay-worker Built
```

- e2e `smtp-templates`: ส่งผ่าน SMTP server จำลอง (`smtp-server`) ได้ message id, log ครบ `QUEUED → SENDING → SENT`; ผู้รับถูกปฏิเสธ (550) → `DEAD`; template แก้แล้วขึ้น v2 และเมลบันทึก `template_version = 2`

### การตัดสินใจระหว่างทาง

- SMTP ค่าเริ่มต้นในฟอร์ม: `smtp.gmail.com:587` (STARTTLS) + App Password; ช่องว่างใน App Password (`abcd efgh ijkl mnop`) ถูกตัดให้อัตโนมัติ
- SMTP ตัวแรกเป็นค่าเริ่มต้นอัตโนมัติ, มีค่าเริ่มต้นได้ตัวเดียว
- จัดประเภท error: 5xx = ถาวร (ไม่ retry) ยกเว้น auth fail (535) ซึ่งเป็นปัญหาการตั้งค่า จึง retry ได้ ไม่ทำให้เมลทั้งคิว DEAD เพราะรหัสผิด
- ส่งทดสอบบันทึกลง `mail_queue` (ไม่มี connection) ถ้าล้มเหลวเป็น `DEAD` ทันทีเพื่อไม่ให้ worker ส่งซ้ำ
- Template: HTML escape อัตโนมัติ, หัวเรื่องและ text ไม่ escape, ไม่มี text template → สร้างจาก HTML; helper `formatDate` / `formatDateTime` / `formatNumber` / `default` (ปี พ.ศ., วันที่จาก ERP ไม่แปลงเขตเวลา)
- Editor ใช้ textarea HTML + preview สด (iframe sandbox) แทน WYSIWYG — template ใหม่เริ่มจากตัวอย่าง PR/PO ที่ใช้คอลัมน์ตาม query จริง
- เก็บข้อมูลตัวอย่างของ template ในคอลัมน์ `mail_templates.variables` (DTO ชื่อ `sampleVariables`)

### Commit list M4

```
aa2063a feat(web): add SMTP and template editor pages with live preview and test send
21d8bdd feat(api): add mail templates CRUD with versions, preview and test send
13ebb4a feat(api): add SMTP configs CRUD with test connection / test mail
202f2ef feat(api): add Handlebars template renderer and Nodemailer mailer service
939f6a8 feat(api): add mail_template_versions and SMTP test status columns
b2a5b12 feat(shared): add SMTP config and mail template schemas
03a06f7 chore: archive M3 plan and add M4 templates and SMTP plan
```
