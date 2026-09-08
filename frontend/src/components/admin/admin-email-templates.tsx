'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  FilePenLine,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { formatAdminDate } from '@/lib/admin-utils';
import { extractEmailVariables } from '@/lib/email-sanitize';
import type { EmailCenterTemplate } from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
} from '@/components/admin/admin-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AdminApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export function EmailTemplatesSection({
  templates,
  loading,
  error,
  onRetry,
  onUse,
  activeId,
}: {
  templates: EmailCenterTemplate[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onUse: (template: EmailCenterTemplate) => void;
  activeId: string | null;
}) {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EmailCenterTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailCenterTemplate | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'email-center', 'templates'] });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => adminApi.duplicateEmailTemplate(id),
    onSuccess: (template) => {
      void invalidate();
      toast.success('Template duplicated', { description: template.name });
    },
    onError: (err: unknown) =>
      toast.error('Duplicate failed', { description: errorMessage(err, 'Please try again.') }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteEmailTemplate(id),
    onSuccess: () => {
      void invalidate();
      setDeleteTarget(null);
      toast.success('Template deleted');
    },
    onError: (err: unknown) =>
      toast.error('Delete failed', { description: errorMessage(err, 'Please try again.') }),
  });

  return (
    <AdminCard>
      <SectionHeading
        title="Templates"
        subtitle="Reusable subjects and bodies with safe {{variable}} placeholders."
        action={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-3.5" /> New Template
          </Button>
        }
      />
      {loading ? (
        <SectionSkeleton lines={3} />
      ) : error ? (
        <SectionFailure
          title="Templates unavailable."
          description="Could not load email templates."
          onRetry={onRetry}
        />
      ) : templates.length === 0 ? (
        <AdminEmptyState
          title="No templates yet"
          description="Create a template to reuse subjects and bodies across operational emails."
          icon={FileText}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="mr-1.5 size-3.5" /> New Template
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {template.name}
                  </p>
                  {template.id === activeId && (
                    <Badge variant="secondary" className="text-[10px]">
                      In composer
                    </Badge>
                  )}
                  {template.is_system && (
                    <Badge variant="outline" className="text-[10px]">
                      Built-in
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {template.subject}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                  <span>Updated {formatAdminDate(template.updated_at, true)}</span>
                  {template.variables.length > 0 && (
                    <span className="font-mono">
                      {template.variables.map((name) => `{{${name}}}`).join(' ')}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => onUse(template)}>
                  Use
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setEditing(template);
                    setEditorOpen(true);
                  }}
                >
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  disabled={duplicateMutation.isPending}
                  onClick={() => duplicateMutation.mutate(template.id)}
                >
                  <Copy className="size-3.5" /> Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                  onClick={() => setDeleteTarget(template)}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={invalidate}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” will be permanently removed. Sent emails that used it keep
              their own copies.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminCard>
  );
}

function TemplateEditorDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: EmailCenterTemplate | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [textBody, setTextBody] = useState('');

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setDescription(editing?.description ?? '');
      setSubject(editing?.subject ?? '');
      setHtmlBody(editing?.html_body ?? '');
      setTextBody(editing?.text_body ?? '');
    }
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? adminApi.updateEmailTemplate(editing.id, {
            name: name.trim(),
            description: description.trim(),
            subject: subject.trim(),
            text_body: textBody,
            html_body: htmlBody,
          })
        : adminApi.createEmailTemplate({
            name: name.trim(),
            description: description.trim(),
            subject: subject.trim(),
            text_body: textBody,
            html_body: htmlBody,
          }),
    onSuccess: (template) => {
      onSaved();
      onOpenChange(false);
      toast.success(editing ? 'Template updated' : 'Template created', {
        description: template.name,
      });
    },
    onError: (err: unknown) =>
      toast.error('Save failed', { description: errorMessage(err, 'Please try again.') }),
  });

  const foundVariables = extractEmailVariables(subject, htmlBody, textBody);
  const valid =
    name.trim().length > 0 && subject.trim().length > 0 && (htmlBody.trim() || textBody.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePenLine className="size-4" />
            {editing ? 'Edit template' : 'New template'}
          </DialogTitle>
          <DialogDescription>
            Use <span className="font-mono text-xs">{`{{variable_name}}`}</span> placeholders for
            values filled in at send time. Placeholders are substituted as plain text — they can
            never execute code.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpl-name" className="text-xs font-semibold">
                Name
              </Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Billing Notification"
                className="mt-1.5"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="tpl-desc" className="text-xs font-semibold">
                Description <span className="font-normal text-slate-400">· optional</span>
              </Label>
              <Input
                id="tpl-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="When to use this template"
                className="mt-1.5"
                maxLength={500}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="tpl-subject" className="text-xs font-semibold">
              Subject
            </Label>
            <Input
              id="tpl-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Billing update for {{company_name}}"
              className="mt-1.5"
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="tpl-html" className="text-xs font-semibold">
              HTML Body
            </Label>
            <Textarea
              id="tpl-html"
              value={htmlBody}
              onChange={(event) => setHtmlBody(event.target.value)}
              placeholder="<p>Hello {{customer_name}},</p>"
              className="mt-1.5 min-h-36 font-mono text-xs leading-5"
              spellCheck={false}
            />
          </div>
          <div>
            <Label htmlFor="tpl-text" className="text-xs font-semibold">
              Plain-Text Body
            </Label>
            <Textarea
              id="tpl-text"
              value={textBody}
              onChange={(event) => setTextBody(event.target.value)}
              placeholder="Hello {{customer_name}},"
              className="mt-1.5 min-h-28 text-sm"
            />
          </div>
          {foundVariables.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Detected variables:{' '}
              <span className="font-mono text-[11px]">
                {foundVariables.map((item) => `{{${item}}}`).join(' ')}
              </span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
