import { ApiClientError } from './api-client';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  TOO_MANY_REQUESTS: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 1 นาทีแล้วลองใหม่',
  EMAIL_TAKEN: 'อีเมลนี้ถูกใช้แล้ว',
  CANNOT_DEACTIVATE_SELF: 'ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้',
  ADMIN_USER_NOT_FOUND: 'ไม่พบผู้ดูแลระบบนี้',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
};

/** Thai message for an error thrown by the API client. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return MESSAGES[err.code] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }
  return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
}
