# ERP Mail Relay

ระบบกลางดึงอีเมลจาก ERP มาเข้า queue แล้วส่งผ่าน Google Workspace SMTP ด้วย template ที่ Admin สร้างเอง

- Design: [`docs/DESIGN.md`](docs/DESIGN.md)
- แผนงาน milestone ปัจจุบัน: [`PLAN.md`](PLAN.md)

## เริ่มต้น

```bash
cp .env.example .env        # แล้วแก้ค่า secret
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
pnpm dev                    # api :3001, web :3000, worker
```

## โครงสร้าง

| path              | หน้าที่                            |
| ----------------- | ---------------------------------- |
| `apps/api`        | NestJS REST API + Prisma + worker entrypoint (`worker.main.ts`, BullMQ jobs) |
| `apps/web`        | Next.js 14 Admin UI                |
| `packages/shared` | DTO / zod schema / enum ที่ใช้ร่วมกัน |
