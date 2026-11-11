'use client';

import { createContactSchema, type ContactDto } from '@erp-mail/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useConnections } from '@/lib/connections';
import { useCreateContact, useUpdateContact } from '@/lib/contacts';
import { errorMessage } from '@/lib/error-messages';

interface ContactForm {
  email: string;
  name: string;
  company: string;
  phone: string;
  connectionId: string;
}

const fromContact = (c: ContactDto | null): ContactForm => ({
  email: c?.email ?? '',
  name: c?.name ?? '',
  company: c?.company ?? '',
  phone: c?.phone ?? '',
  connectionId: c?.connectionId ?? '',
});

/** Full-page form for an address added by hand (`contact` null = create). */
export function ContactEditor({ contact }: { contact: ContactDto | null }) {
  const router = useRouter();
  const { data: connections } = useConnections();
  const create = useCreateContact();
  const update = useUpdateContact();
  const [form, setForm] = useState<ContactForm>(() => fromContact(contact));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ContactForm>) => setForm((f) => ({ ...f, ...patch }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = createContactSchema.safeParse({
      ...form,
      connectionId: form.connectionId || null,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return setError(
        field === 'email' ? 'กรุณากรอกอีเมลให้ถูกต้อง' : 'ข้อมูลยาวเกินไป กรุณาตรวจสอบอีกครั้ง',
      );
    }
    try {
      if (contact) {
        await update.mutateAsync({ id: contact.id, input: parsed.data });
        toast.success(`บันทึก ${parsed.data.email} แล้ว`);
      } else {
        await create.mutateAsync(parsed.data);
        toast.success(`เพิ่ม ${parsed.data.email} แล้ว`);
      }
      router.push('/contacts');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-6">
      <div>
        <Link href="/contacts" className="text-sm text-muted-foreground hover:underline">
          ← กลับไปหน้า Contacts
        </Link>
        <h1 className="text-2xl font-semibold">
          {contact ? `แก้ไข ${contact.email}` : 'เพิ่มอีเมลเอง'}
        </h1>
        <p className="text-sm text-muted-foreground">
          อีเมลที่ไม่ได้มาจาก ERP — จะแสดงในหน้า Contacts พร้อมป้าย &quot;เพิ่มเอง&quot;
        </p>
      </div>

      <div className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Label htmlFor="ct-email">อีเมล *</Label>
          <Input
            id="ct-email"
            type="email"
            placeholder="name@partner.com"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ct-name">ชื่อ</Label>
            <Input
              id="ct-name"
              maxLength={200}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-company">บริษัท / แผนก</Label>
            <Input
              id="ct-company"
              maxLength={200}
              value={form.company}
              onChange={(e) => set({ company: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-phone">โทรศัพท์</Label>
            <Input
              id="ct-phone"
              maxLength={50}
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-conn">Database</Label>
            <NativeSelect
              id="ct-conn"
              value={form.connectionId}
              onChange={(e) => set({ connectionId: e.target.value })}
            >
              <option value="">ไม่ระบุ</option>
              {connections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || update.isPending}>
          บันทึก
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/contacts')}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
