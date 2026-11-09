import { TemplateEditor } from '@/components/template-editor';

export default function EditTemplatePage({ params }: { params: { id: string } }) {
  return <TemplateEditor id={params.id} />;
}
