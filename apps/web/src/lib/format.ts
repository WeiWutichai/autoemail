const dateTimeFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}

/** "5 นาที", "1 ชั่วโมง 30 นาที", "45 วินาที" */
export function formatInterval(sec: number): string {
  if (sec < 60) return `${sec} วินาที`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [h ? `${h} ชั่วโมง` : '', m ? `${m} นาที` : ''].filter(Boolean).join(' ');
}
