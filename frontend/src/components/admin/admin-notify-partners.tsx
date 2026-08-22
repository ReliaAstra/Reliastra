'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Target =
  | { kind: 'all' }
  | { kind: 'partner'; partnerId: string; label: string };

/**
 * Compose a notification to partners.
 *
 * Delivery is two-channel: every recipient gets the in-app notification that
 * appears on their dashboard's Notifications page, and — unless the admin
 * turns the email copy off, or the partner opted out of that category — an
 * email as well.
 */
export function NotifyPartnersDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Target;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<'announcement' | 'marketing'>('announcement');
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setBody('');
      setCategory('announcement');
      setSendEmail(true);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.notifyPartners(
        target.kind === 'all'
          ? {
              audience: 'all',
              statuses: ['active'],
              title: title.trim(),
              body: body.trim(),
              category,
              send_email: sendEmail,
            }
          : {
              audience: 'selected',
              partner_ids: [target.partnerId],
              title: title.trim(),
              body: body.trim(),
              category,
              send_email: sendEmail,
            }
      ),
    onSuccess: (result) => {
      toast.success(
        `Sent to ${result.recipients} partner${result.recipients === 1 ? '' : 's'}` +
          (sendEmail ? ` · ${result.emailed} emailed` : '')
      );
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not send the notification'),
  });

  const disabled = title.trim().length === 0 || body.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-slate-200 dark:border-white/10">
        <DialogHeader>
          <DialogTitle>
            {target.kind === 'all' ? 'Message all active partners' : 'Message partner'}
          </DialogTitle>
          <DialogDescription>
            {target.kind === 'all'
              ? 'Every active partner receives this in their dashboard notifications, plus an email if they allow that category.'
              : `${target.label} receives this in their dashboard notifications, plus an email if they allow that category.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="notify-title" className="text-xs font-medium">
              Title
            </Label>
            <Input
              id="notify-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Commission rate update for Q4"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notify-body" className="text-xs font-medium">
              Message
            </Label>
            <Textarea
              id="notify-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What do partners need to know?"
              rows={6}
              maxLength={5000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Category</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as 'announcement' | 'marketing')}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="announcement">Program announcement</SelectItem>
                  <SelectItem value="marketing">Marketing &amp; tips</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                {category === 'marketing'
                  ? 'Marketing emails are opt-in — most partners will only see this in-app.'
                  : 'Announcement emails are on by default for partners.'}
              </p>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-white/10">
              <div>
                <p className="text-xs font-medium">Send email copy</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  In-app delivery always happens.
                </p>
              </div>
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} aria-label="Send email copy" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={disabled || mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-3.5" />
            )}
            Send notification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
