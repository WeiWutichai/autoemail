import { ApiClientError } from './api-client';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  TOO_MANY_REQUESTS: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 1 นาทีแล้วลองใหม่',
  EMAIL_TAKEN: 'อีเมลนี้ถูกใช้แล้ว',
  CANNOT_DEACTIVATE_SELF: 'ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้',
  ADMIN_USER_NOT_FOUND: 'ไม่พบผู้ดูแลระบบนี้',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  CONNECTION_NOT_FOUND: 'ไม่พบ connection นี้',
  CONNECTION_NAME_TAKEN: 'ชื่อ connection นี้ถูกใช้แล้ว',
  CONNECTION_IN_USE:
    'connection นี้มีการตั้งค่าดึงข้อมูลหรือประวัติเมลผูกอยู่ จึงลบไม่ได้ ให้ปิดการใช้งานแทน',
  CONNECTION_INACTIVE: 'connection นี้ถูกปิดการใช้งานอยู่',
  SYNC_CONFIG_NOT_FOUND: 'ไม่พบการตั้งค่าดึงข้อมูลนี้',
  SYNC_IN_PROGRESS: 'กำลังดึงข้อมูลอยู่ กรุณารอสักครู่',
  SQL_NOT_ALLOWED: 'SQL ต้องเป็นคำสั่ง SELECT เดียวเท่านั้น (ห้าม ; INSERT UPDATE DELETE EXEC ฯลฯ)',
  ERP_QUERY_FAILED: 'รัน query บน ERP ไม่สำเร็จ',
  SMTP_NOT_FOUND: 'ไม่พบการตั้งค่า SMTP นี้',
  SMTP_NAME_TAKEN: 'ชื่อ SMTP นี้ถูกใช้แล้ว',
  SMTP_IN_USE: 'SMTP นี้มีประวัติการส่งเมลผูกอยู่ จึงลบไม่ได้',
  SMTP_DEFAULT_REQUIRED: 'ต้องมี SMTP ค่าเริ่มต้น 1 ตัว — ตั้งตัวอื่นเป็นค่าเริ่มต้นก่อน',
  SMTP_NOT_CONFIGURED: 'ยังไม่ได้ตั้งค่า SMTP ค่าเริ่มต้น ไปที่หน้า SMTP เพื่อเพิ่ม',
  TEMPLATE_NOT_FOUND: 'ไม่พบ template นี้',
  TEMPLATE_CODE_TAKEN: 'รหัส template นี้ถูกใช้แล้ว',
  TEMPLATE_IN_USE: 'template นี้เคยใช้ส่งเมลแล้ว จึงลบไม่ได้ ให้ปิดการใช้งานแทน',
  TEMPLATE_INVALID: 'รูปแบบ template ไม่ถูกต้อง',
};

/** Codes whose API message (already sanitized) helps the admin fix the input. */
const DETAIL_CODES = new Set(['ERP_QUERY_FAILED', 'TEMPLATE_INVALID']);

/** Thai message for an error thrown by the API client. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    const base = MESSAGES[err.code] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    // Driver messages (already sanitized by the API) help the admin fix the query.
    return DETAIL_CODES.has(err.code) ? `${base}: ${err.message}` : base;
  }
  return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
}
