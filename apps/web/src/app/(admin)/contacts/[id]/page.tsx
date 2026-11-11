'use client';

import Link from 'next/link';
import { ContactEditor } from '@/components/contact-editor';
import { useContact } from '@/lib/contacts';
import { errorMessage } from '@/lib/error-messages';

export default function EditContactPage({ params }: { params: { id: string } }) {
  const { data: contact, isLoading, error } = useContact(params.id);

  if (isLoading) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (error || !contact || contact.source !== 'MANUAL') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          {error
            ? errorMessage(error)
            : 'แก้ไขได้เฉพาะอีเมลที่เพิ่มเอง — รายชื่อจาก ERP ให้แก้ที่ ERP'}
        </p>
        <Link href="/contacts" className="text-sm underline">
          กลับไปหน้า Contacts
        </Link>
      </div>
    );
  }
  return <ContactEditor key={contact.id} contact={contact} />;
}
