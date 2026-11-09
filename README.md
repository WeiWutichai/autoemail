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

### Deploy จาก GitHub (ปุ่มเดียว)

เตรียม VPS ครั้งแรก (Ubuntu):

```bash
# 1) ติดตั้ง Docker แล้วสร้าง user สำหรับ deploy
curl -fsSL https://get.docker.com | sh
sudo adduser --disabled-password --gecos "" deploy && sudo usermod -aG docker deploy
sudo mkdir -p /opt/autoemail && sudo chown deploy:deploy /opt/autoemail

# 2) (บนเครื่องตัวเอง) สร้าง SSH key สำหรับ GitHub Actions แล้วใส่ public key ให้ user deploy
ssh-keygen -t ed25519 -f autoemail_deploy -N "" -C "github-actions-deploy"
ssh-copy-id -i autoemail_deploy.pub deploy@<VPS_IP>

# 3) (บน VPS ในฐานะ deploy) clone repo แล้วสร้าง .env
#    ถ้า repo เป็น private: สร้าง key บน VPS (ssh-keygen -t ed25519) แล้วเพิ่ม .pub เป็น
#    Deploy key (read-only) ใน GitHub → Settings → Deploy keys และ clone ด้วย git@github.com:WeiWutichai/autoemail.git
git clone https://github.com/WeiWutichai/autoemail.git /opt/autoemail
cd /opt/autoemail && cp .env.example .env && nano .env
```

จากนั้นขอใบรับรองครั้งแรก (ข้อ 1 ด้านบน), รัน `sh deploy/up.sh` แล้วสร้าง admin คนแรก (ข้อ 3 ด้านบน)

ตั้ง Secrets ใน GitHub → Settings → Secrets and variables → Actions:

| Secret | ค่า |
| --- | --- |
| `VPS_HOST` | IP หรือชื่อโดเมนของ VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | เนื้อหาไฟล์ private key `autoemail_deploy` ทั้งไฟล์ |
| `VPS_KNOWN_HOSTS` | ผลของ `ssh-keyscan -p 22 <VPS_IP>` (กันการต่อผิดเครื่อง) |
| `VPS_PORT` | (ไม่บังคับ) port SSH, default `22` |
| `VPS_APP_DIR` | (ไม่บังคับ) ที่อยู่ของ repo บน VPS, default `/opt/autoemail` |

Deploy: GitHub → Actions → **Deploy to VPS** → Run workflow — VPS จะ `git pull` branch `main` แล้ว build + restart ทุก service (ถ้า build ไม่ผ่าน ระบบเดิมยังทำงานต่อ)

Deploy จากเครื่องตัวเอง (ไม่ผ่าน GitHub): วาง key และ `vps.env` (ดูตัวอย่าง `deploy/vps.env.example`) ไว้ใน `deploy/private/` ซึ่ง git ไม่เก็บ, `ssh` เข้า VPS ด้วยมือ 1 ครั้งเพื่อยืนยัน host key แล้วรัน `sh deploy/deploy-local.sh`

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
