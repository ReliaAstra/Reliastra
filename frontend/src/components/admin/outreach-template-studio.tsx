'use client';

import { Children, cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FilePlus2,
  FileText,
  Globe2,
  Loader2,
  Mail,
  Monitor,
  Paintbrush2,
  PanelTop,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { extractEmailVariables, renderEmailVariables } from '@/lib/email-sanitize';
import type { EmailCenterTemplate } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STUDIO_MARKER = 'rs-outreach-studio-v1';
const CONFIG_MARKER = 'rs-outreach-config-';
const OUTREACH_DESCRIPTION = 'Outreach Studio · ';
const CONTROL_CLASS =
  'border-[#30445d] bg-[#0a1725] text-[#edf5fc] placeholder:text-[#71869c] focus-visible:border-[#46c8ee] focus-visible:ring-[#46c8ee]/20';
const TEXTAREA_CLASS = `${CONTROL_CLASS} min-h-24 resize-y leading-6`;

const PALETTES = [
  { id: 'orbit', name: 'Deep orbit', accent: '#45c7ef', canvas: '#eaf1f8', surface: '#ffffff', footer: '#f3f6f9', text: '#10243a', muted: '#60748a' },
  { id: 'signal', name: 'Signal blue', accent: '#3578ed', canvas: '#edf2f8', surface: '#ffffff', footer: '#f1f4f8', text: '#10243a', muted: '#60748a' },
  { id: 'launch', name: 'Launch amber', accent: '#e6ae50', canvas: '#f4f0e8', surface: '#fffdf8', footer: '#f6f0e3', text: '#282e35', muted: '#77786f' },
  { id: 'telemetry', name: 'Telemetry mint', accent: '#2eb99e', canvas: '#eaf3ef', surface: '#ffffff', footer: '#edf5f2', text: '#122f2c', muted: '#637a76' },
  { id: 'redline', name: 'Redline', accent: '#e56e61', canvas: '#f5eeeb', surface: '#ffffff', footer: '#f7f0ee', text: '#302522', muted: '#806d67' },
  { id: 'ion', name: 'Ion violet', accent: '#9283ed', canvas: '#f0eef9', surface: '#ffffff', footer: '#f4f2fb', text: '#28233e', muted: '#77728b' },
] as const;

type PaletteId = (typeof PALETTES)[number]['id'] | 'custom';
type FontPreset = 'command' | 'editorial' | 'technical';
type HeaderTreatment = 'orbital' | 'precision' | 'signal';
type StudioPanel = 'content' | 'identity' | 'style' | 'footer';
type PreviewMode = 'desktop' | 'mobile';

export interface OutreachTemplateDraft {
  name: string;
  objective: string;
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  body: string;
  ctaEnabled: boolean;
  ctaLabel: string;
  ctaUrl: string;
  brandName: string;
  headerTreatment: HeaderTreatment;
  signatureEnabled: boolean;
  signatureName: string;
  signatureRole: string;
  signatureEmail: string;
  paletteId: PaletteId;
  accentColor: string;
  canvasColor: string;
  surfaceColor: string;
  footerBackground: string;
  textColor: string;
  mutedColor: string;
  fontPreset: FontPreset;
  contentWidth: 560 | 620 | 680;
  cornerRadius: number;
  footerEnabled: boolean;
  footerAlignment: 'left' | 'center';
  footerNote: string;
  postalAddress: string;
  supportEmail: string;
  websiteUrl: string;
  linkedInUrl: string;
  xUrl: string;
  unsubscribeEnabled: boolean;
  unsubscribeText: string;
  unsubscribeUrl: string;
}

export const DEFAULT_DRAFT: OutreachTemplateDraft = {
  name: 'Reliability introduction',
  objective: 'First touch · infrastructure partners',
  subject: 'A more resilient service surface for {{company}}',
  preheader: 'A short, specific observation for {{company}}.',
  eyebrow: 'INDEPENDENT RELIABILITY INTELLIGENCE',
  headline: 'A signal worth acting on.',
  body: 'Hi {{first_name}},\n\nI noticed {{company}} depends on services that can become difficult to verify once an incident starts. RELIASTRA independently observes external APIs and turns confirmed failures into evidence your team can act on.\n\nWould a short overview be useful? I can share how teams establish a clearer record of dependency health without adding another monitoring surface.',
  ctaEnabled: true,
  ctaLabel: 'Review the reliability brief',
  ctaUrl: 'https://reliastra.com/product',
  brandName: 'RELIASTRA',
  headerTreatment: 'orbital',
  signatureEnabled: true,
  signatureName: 'Avery Chen',
  signatureRole: 'Partnerships · RELIASTRA',
  signatureEmail: 'support@reliastra.com',
  paletteId: 'orbit',
  accentColor: '#45c7ef',
  canvasColor: '#eaf1f8',
  surfaceColor: '#ffffff',
  footerBackground: '#f3f6f9',
  textColor: '#10243a',
  mutedColor: '#60748a',
  fontPreset: 'command',
  contentWidth: 620,
  cornerRadius: 16,
  footerEnabled: true,
  footerAlignment: 'center',
  footerNote: 'You are receiving this direct message because it may be relevant to your work.',
  postalAddress: 'Reliastra · Lagos, Nigeria',
  supportEmail: 'support@reliastra.com',
  websiteUrl: 'https://reliastra.com',
  linkedInUrl: '',
  xUrl: '',
  unsubscribeEnabled: true,
  unsubscribeText: 'Prefer not to hear from us? Unsubscribe',
  unsubscribeUrl: 'mailto:support@reliastra.com?subject=Unsubscribe',
};

const PANELS: Array<{ id: StudioPanel; number: string; title: string; caption: string; icon: typeof FileText }> = [
  { id: 'content', number: '01', title: 'Message', caption: 'Intent & copy', icon: Mail },
  { id: 'identity', number: '02', title: 'Identity', caption: 'Sender & signature', icon: PanelTop },
  { id: 'style', number: '03', title: 'Visual system', caption: 'Color & typography', icon: Paintbrush2 },
  { id: 'footer', number: '04', title: 'Footer', caption: 'Trust & opt-out', icon: ShieldCheck },
];

const SAMPLE_VARIABLES: Record<string, string> = {
  first_name: 'Morgan',
  recipient_name: 'Morgan Lee',
  company: 'Northstar Systems',
  organization: 'Northstar Systems',
  domain: 'northstar.io',
  contact_email: 'morgan@northstar.io',
  sender_name: 'Avery Chen',
  sender_role: 'Partnerships · RELIASTRA',
  postal_address: 'Reliastra · Lagos, Nigeria',
  unsubscribe_url: 'mailto:support@reliastra.com?subject=Unsubscribe',
};

const INSERTABLE_VARIABLES = [
  'first_name',
  'company',
  'domain',
  'contact_email',
  'sender_name',
  'recipient_role',
] as const;

export function OutreachTemplateStudio() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OutreachTemplateDraft>(DEFAULT_DRAFT);
  const [panel, setPanel] = useState<StudioPanel>('content');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const [sampleData, setSampleData] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<EmailCenterTemplate | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const templatesQuery = useQuery({
    queryKey: ['admin', 'email-center', 'templates'],
    queryFn: adminApi.emailTemplates,
    staleTime: 60_000,
  });
  const templates = (templatesQuery.data ?? []).filter(isOutreachStudioTemplate);
  const variables = useMemo(
    () => extractEmailVariables(draft.subject, draft.preheader, draft.body),
    [draft.body, draft.preheader, draft.subject]
  );
  const subjectLength = draft.subject.trim().length;
  const wordCount = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
  const renderedEmail = useMemo(() => buildOutreachEmailHtml(draft), [draft]);
  const previewContent = useMemo(() => {
    const body = sampleData ? renderEmailVariables(renderedEmail, SAMPLE_VARIABLES) : renderedEmail;
    return wrapEmailPreview(body, draft.canvasColor);
  }, [draft.canvasColor, renderedEmail, sampleData]);
  const validationIssue = getValidationIssue(draft);

  const saveMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string | null; value: OutreachTemplateDraft }) => {
      const payload = templatePayload(value);
      return id ? adminApi.updateEmailTemplate(id, payload) : adminApi.createEmailTemplate(payload);
    },
    onSuccess: async (template) => {
      setSelectedTemplateId(template.id);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'email-center', 'templates'] });
      toast.success('Template saved to the outreach library', { description: template.name });
    },
    onError: (error: Error) => toast.error(error.message || 'Could not save this template.'),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => adminApi.duplicateEmailTemplate(id),
    onSuccess: async (template) => {
      setDraft(draftFromTemplate(template));
      setSelectedTemplateId(template.id);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'email-center', 'templates'] });
      toast.success('Working copy created', { description: template.name });
    },
    onError: (error: Error) => toast.error(error.message || 'Could not duplicate this template.'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteEmailTemplate(id),
    onSuccess: async () => {
      const wasSelected = deleteTarget?.id === selectedTemplateId;
      setDeleteTarget(null);
      if (wasSelected) resetDraft();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'email-center', 'templates'] });
      toast.success('Template removed from the library');
    },
    onError: (error: Error) => toast.error(error.message || 'Could not delete this template.'),
  });

  const updateDraft = <K extends keyof OutreachTemplateDraft>(key: K, value: OutreachTemplateDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  function resetDraft() {
    setDraft(DEFAULT_DRAFT);
    setSelectedTemplateId(null);
    setPanel('content');
  }

  function loadTemplate(template: EmailCenterTemplate) {
    setDraft(draftFromTemplate(template));
    setSelectedTemplateId(template.id);
    setPanel('content');
    toast.success('Template loaded', { description: 'Make your changes, then save to update it.' });
  }

  function addToken(target: 'subject' | 'body', name: string) {
    const token = `{{${name}}}`;
    if (target === 'subject') {
      const input = subjectRef.current;
      const start = input?.selectionStart ?? draft.subject.length;
      const end = input?.selectionEnd ?? draft.subject.length;
      const next = `${draft.subject.slice(0, start)}${token}${draft.subject.slice(end)}`;
      updateDraft('subject', next);
      requestAnimationFrame(() => {
        input?.focus();
        input?.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }
    const input = bodyRef.current;
    const start = input?.selectionStart ?? draft.body.length;
    const end = input?.selectionEnd ?? draft.body.length;
    const next = `${draft.body.slice(0, start)}${token}${draft.body.slice(end)}`;
    updateDraft('body', next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const activePanelIndex = PANELS.findIndex((item) => item.id === panel);
  const footerReady = draft.footerEnabled && draft.unsubscribeEnabled && Boolean(draft.postalAddress.trim());

  return (
    <section className="relative isolate overflow-hidden rounded-[24px] border border-[#263c55] bg-[#081624] text-[#ecf4fb] shadow-[0_24px_70px_rgba(3,12,22,0.24)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage:
            'radial-gradient(circle at 84% 8%, rgba(47, 151, 203, .22), transparent 27%), radial-gradient(circle at 8% 82%, rgba(58, 104, 174, .14), transparent 31%), linear-gradient(rgba(127, 173, 207, .035) 1px, transparent 1px), linear-gradient(90deg, rgba(127, 173, 207, .035) 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 36px 36px, 36px 36px',
        }}
      />
      <div className="relative border-b border-[#26394f] px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#27506b] bg-[#10283a]/90 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#78d6f4]">
            <span className="size-1.5 rounded-full bg-[#61d8f5] shadow-[0_0_9px_rgba(97,216,245,.85)]" />
            Outreach systems / template studio
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.17em] text-[#607991]">Build 02.6 · HTML-safe output</span>
        </div>
        <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-[clamp(2rem,5vw,3.45rem)] font-semibold leading-[1.02] tracking-[-0.065em] text-[#f2f7fb]">
              Engineer a better <span className="text-[#56c9eb]">first impression.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#99acc0] sm:text-[15px]">
              Build precise, personal outreach from the message down to the legal footer. Every decision is editable; every change renders live.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7890a7]">
              <span className="inline-flex items-center gap-2"><Check className="size-3.5 text-[#58d3b7]" /> Outlook-safe markup</span>
              <span className="inline-flex items-center gap-2"><Check className="size-3.5 text-[#58d3b7]" /> Personalization tokens</span>
              <span className="inline-flex items-center gap-2"><Check className="size-3.5 text-[#58d3b7]" /> Custom footer system</span>
            </div>
          </div>
          <div className="rounded-xl border border-[#29425c] bg-[#0d1d2d]/80 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#7890a7]">Studio status</p>
              <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#65d8b9]"><span className="size-1.5 rounded-full bg-[#65d8b9]" /> Online</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#26394f] pt-3">
              <div><p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#688198]">Library</p><p className="mt-1 text-xl font-semibold tracking-[-0.04em] tabular-nums text-[#edf6fc]">{String(templates.length).padStart(2, '0')}</p></div>
              <div><p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#688198]">Output</p><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[#edf6fc]"><ShieldCheck className="size-3.5 text-[#55c7e8]" /> Sanitized</p></div>
            </div>
          </div>
        </div>
        <div className="mt-7 flex flex-col gap-3 border-t border-[#21354b] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#d8e5ef]">{selectedTemplate ? `Editing · ${selectedTemplate.name}` : 'Unsaved design · Reliability introduction'}</p>
            <p className="mt-1 text-[10px] text-[#6f879e]">Saved templates are shared with the Email Center and stay editable here.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={resetDraft}
              className="h-9 border-[#344b64] bg-[#102136] text-[#d5e1eb] hover:border-[#4c6680] hover:bg-[#172d44] hover:text-white"
            >
              <FilePlus2 className="size-3.5" /> New design
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate({ id: selectedTemplateId, value: draft })}
              disabled={Boolean(validationIssue) || saveMutation.isPending}
              className="h-9 bg-[#4ac8ec] px-4 font-semibold text-[#071725] shadow-[0_0_22px_rgba(74,200,236,.13)] hover:bg-[#79dcf5] disabled:bg-[#294054] disabled:text-[#8093a6]"
            >
              {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ClipboardCheck className="size-3.5" />}
              {saveMutation.isPending ? 'Saving…' : selectedTemplateId ? 'Save changes' : 'Save to library'}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6 lg:p-7">
        <TemplateLibrary
          templates={templates}
          loading={templatesQuery.isLoading}
          error={templatesQuery.isError}
          selectedId={selectedTemplateId}
          onRetry={() => void templatesQuery.refetch()}
          onLoad={loadTemplate}
          onDuplicate={(template) => duplicateMutation.mutate(template.id)}
          onDelete={setDeleteTarget}
          busy={duplicateMutation.isPending || deleteMutation.isPending}
        />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(410px,0.94fr)_minmax(0,1.06fr)]">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-[#294057] bg-[#0d1d2d]/95 shadow-[0_16px_40px_rgba(1,10,20,.16)]">
            <div className="border-b border-[#263b51] px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.19em] text-[#58c8e8]">Configure message</p>
                  <p className="mt-1 text-lg font-semibold tracking-[-0.035em] text-[#edf5fb]">Four independent control surfaces</p>
                </div>
                <span className="hidden rounded-md border border-[#2a435b] bg-[#101f30] px-2 py-1 font-mono text-[9px] text-[#8da3b7] sm:inline-flex">
                  {String(activePanelIndex + 1).padStart(2, '0')} / 04
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5" role="group" aria-label="Template settings">
                {PANELS.map((item, index) => {
                  const Icon = item.icon;
                  const active = item.id === panel;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPanel(item.id)}
                      className={`group min-w-0 rounded-lg border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#47c9ec]/60 ${active ? 'border-[#3c98b5] bg-[#15344a] text-[#f4fbff]' : 'border-transparent bg-[#0a1826] text-[#7890a6] hover:border-[#2b455e] hover:bg-[#12263a]'}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-mono text-[8px] font-semibold tracking-[0.13em] ${active ? 'text-[#6dd7f3]' : 'text-[#536d84]'}`}>{item.number}</span>
                        <Icon className={`size-3.5 ${active ? 'text-[#7fdef5]' : 'text-[#70869c]'}`} />
                      </div>
                      <p className="mt-2 truncate text-[10px] font-semibold sm:text-[11px]">{item.title}</p>
                      <p className={`mt-0.5 hidden truncate text-[9px] sm:block ${active ? 'text-[#9db7c9]' : 'text-[#637a90]'}`}>{item.caption}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-[550px] space-y-5 px-4 py-5 sm:px-5">
              {panel === 'content' && (
                <ContentPanel
                  draft={draft}
                  updateDraft={updateDraft}
                  bodyRef={bodyRef}
                  subjectRef={subjectRef}
                  addToken={addToken}
                />
              )}
              {panel === 'identity' && <IdentityPanel draft={draft} updateDraft={updateDraft} />}
              {panel === 'style' && <StylePanel draft={draft} updateDraft={updateDraft} />}
              {panel === 'footer' && <FooterPanel draft={draft} updateDraft={updateDraft} />}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#263b51] bg-[#0a1928]/70 px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                {validationIssue ? (
                  <p className="text-[11px] text-[#f0bd73]">{validationIssue}</p>
                ) : (
                  <p className="inline-flex items-center gap-1.5 text-[11px] text-[#7f98ad]"><Check className="size-3.5 text-[#5ad2b4]" /> Ready to save · {variables.length} dynamic field{variables.length === 1 ? '' : 's'}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={activePanelIndex === 0}
                  onClick={() => setPanel(PANELS[Math.max(0, activePanelIndex - 1)].id)}
                  className="h-8 border-[#324960] bg-transparent px-3 text-xs text-[#c5d4e1] hover:bg-[#15283a] hover:text-white"
                >Back</Button>
                <Button
                  type="button"
                  disabled={activePanelIndex === PANELS.length - 1}
                  onClick={() => setPanel(PANELS[Math.min(PANELS.length - 1, activePanelIndex + 1)].id)}
                  className="h-8 gap-1.5 bg-[#183950] px-3 text-xs text-[#bdeeff] hover:bg-[#214963]"
                >Next <ChevronRight className="size-3.5" /></Button>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-[#294057] bg-[#0e1e2f]/95 shadow-[0_16px_40px_rgba(1,10,20,.16)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263b51] px-4 py-3.5 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-[#2a4b61] bg-[#122a3c] text-[#69d1ed]"><Mail className="size-4" /></span>
                  <div><p className="text-sm font-semibold text-[#edf5fb]">Live email render</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#718aa1]">Inline CSS · table layout · sanitized</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-[#2a4056] bg-[#091725] p-1" aria-label="Preview width">
                    <button type="button" aria-label="Desktop preview" aria-pressed={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')} className={`flex size-7 items-center justify-center rounded-md transition-colors ${previewMode === 'desktop' ? 'bg-[#1c3b51] text-[#74d9f4]' : 'text-[#71869a] hover:text-white'}`}><Monitor className="size-3.5" /></button>
                    <button type="button" aria-label="Mobile preview" aria-pressed={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')} className={`flex size-7 items-center justify-center rounded-md transition-colors ${previewMode === 'mobile' ? 'bg-[#1c3b51] text-[#74d9f4]' : 'text-[#71869a] hover:text-white'}`}><Smartphone className="size-3.5" /></button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#22374c] bg-[#0b1a29] px-4 py-2.5 sm:px-5">
                <p className="min-w-0 truncate text-[11px] text-[#91a6ba]"><span className="font-semibold text-[#c5d4e0]">Subject</span><span className="mx-2 text-[#4e667e]">/</span>{draft.subject || 'Untitled message'}</p>
                <button type="button" aria-pressed={sampleData} onClick={() => setSampleData((current) => !current)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#29445c] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8fa9bf] transition-colors hover:border-[#3a6581] hover:text-[#d4e9f4]">
                  <Sparkles className="size-3 text-[#60cce9]" />{sampleData ? 'Sample data' : 'Show tokens'}
                </button>
              </div>
              <div className="overflow-x-auto bg-[#0a1826] p-3 sm:p-5">
                <iframe
                  key={`${previewMode}-${sampleData}`}
                  title="Live outreach email preview"
                  sandbox=""
                  srcDoc={previewContent}
                  className="mx-auto block h-[760px] rounded-xl border border-[#31485f] bg-[#eaf1f8] shadow-[0_10px_30px_rgba(0,0,0,.2)] transition-[width] duration-300"
                  style={{ width: previewMode === 'mobile' ? '390px' : '100%', maxWidth: '100%' }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#263b51] px-4 py-3 sm:px-5">
                <p className="inline-flex items-center gap-1.5 text-[10px] text-[#8198ac]"><ShieldCheck className="size-3.5 text-[#5dd3b6]" /> Preview is isolated from the admin console</p>
                <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#627b92]">{previewMode === 'mobile' ? '390 px viewport' : 'fluid / max width'} · 01 / 01</span>
              </div>
            </div>

            <ReadinessPanel
              subjectLength={subjectLength}
              wordCount={wordCount}
              variables={variables}
              footerReady={footerReady}
              footerEnabled={draft.footerEnabled}
            />
          </div>
        </div>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-[#2b425a] bg-[#0c1b2b] text-[#eef5fa]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this outreach template?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#9aacbe]">
              “{deleteTarget?.name}” will be removed from the shared template library. Previously sent messages are unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#344b64] bg-transparent text-[#c7d5e2] hover:bg-[#172b40] hover:text-white">Keep template</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              disabled={deleteMutation.isPending}
              className="bg-[#b95157] text-white hover:bg-[#ce6267]"
            >
              {deleteMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Remove template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function TemplateLibrary({
  templates,
  loading,
  error,
  selectedId,
  onRetry,
  onLoad,
  onDuplicate,
  onDelete,
  busy,
}: {
  templates: EmailCenterTemplate[];
  loading: boolean;
  error: boolean;
  selectedId: string | null;
  onRetry: () => void;
  onLoad: (template: EmailCenterTemplate) => void;
  onDuplicate: (template: EmailCenterTemplate) => void;
  onDelete: (template: EmailCenterTemplate) => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#294057] bg-[#0d1d2d]/90 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-[#2b435c] bg-[#12263a] text-[#70d4ef]"><FileText className="size-4" /></span>
          <div><p className="text-sm font-semibold text-[#edf5fb]">Template library</p><p className="mt-0.5 text-[10px] text-[#7e95aa]">Pick up where you left off · {templates.length} saved</p></div>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6e879d]"><Zap className="size-3 text-[#e3b45e]" /> Shared with Email Center</span>
      </div>
      {error ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#784a45]/70 bg-[#382422]/35 px-3 py-3">
          <p className="text-xs text-[#e5b2a6]">The template library could not be reached. Your current design is still safe in this editor.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="h-8 border-[#76504a] bg-transparent text-[#f0c1b3] hover:bg-[#4a2f2b]"><RefreshCw className="size-3.5" /> Retry</Button>
        </div>
      ) : loading ? (
        <div className="mt-4 flex gap-2 overflow-hidden" aria-label="Loading templates">
          {[0, 1, 2].map((item) => <div key={item} className="h-[72px] min-w-[220px] flex-1 animate-pulse rounded-lg border border-[#263b50] bg-[#101f30]" />)}
        </div>
      ) : templates.length ? (
        <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1">
          {templates.map((template, index) => {
            const active = template.id === selectedId;
            return (
              <div key={template.id} className={`group flex min-w-[230px] max-w-[310px] flex-1 items-stretch overflow-hidden rounded-xl border transition-colors ${active ? 'border-[#42bbdd] bg-[#15364b]' : 'border-[#263e54] bg-[#101f30] hover:border-[#3b5d78] hover:bg-[#14273a]'}`}>
                <button type="button" onClick={() => onLoad(template)} className="min-w-0 flex-1 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#51d0ee]">
                  <div className="flex items-center gap-2"><span className={`font-mono text-[9px] ${active ? 'text-[#62d5f1]' : 'text-[#637d94]'}`}>{String(index + 1).padStart(2, '0')}</span><span className="truncate text-xs font-semibold text-[#e6f0f7]">{template.name}</span>{active && <Check className="size-3 shrink-0 text-[#57d7b9]" />}</div>
                  <p className="mt-1.5 truncate text-[10px] text-[#869bae]">{template.subject}</p>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 border-l border-[#263e54] px-1.5">
                  <button type="button" aria-label={`Duplicate ${template.name}`} disabled={busy} onClick={() => onDuplicate(template)} className="flex size-7 items-center justify-center rounded-md text-[#8299ad] transition-colors hover:bg-[#203a50] hover:text-[#d5ecf5] disabled:opacity-45"><Copy className="size-3.5" /></button>
                  <button type="button" aria-label={`Delete ${template.name}`} disabled={busy} onClick={() => onDelete(template)} className="flex size-7 items-center justify-center rounded-md text-[#8299ad] transition-colors hover:bg-[#4b2d32] hover:text-[#f4a7a4] disabled:opacity-45"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-[#35506a] bg-[#0a1928] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-semibold text-[#dce8f0]">No saved outreach templates yet</p><p className="mt-1 text-[11px] leading-5 text-[#8197ab]">This starter design is ready to customize. Save it once you like the message and footer.</p></div>
          <span className="shrink-0 rounded-md border border-[#31526b] bg-[#122b3d] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.13em] text-[#72cfe9]">Starter loaded</span>
        </div>
      )}
    </div>
  );
}

function ContentPanel({
  draft,
  updateDraft,
  bodyRef,
  subjectRef,
  addToken,
}: {
  draft: OutreachTemplateDraft;
  updateDraft: <K extends keyof OutreachTemplateDraft>(key: K, value: OutreachTemplateDraft[K]) => void;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  subjectRef: RefObject<HTMLInputElement | null>;
  addToken: (target: 'subject' | 'body', name: string) => void;
}) {
  return (
    <div className="space-y-5">
      <PanelIntro icon={Mail} kicker="01 / Content architecture" title="Say the right thing." description="Set the intent, then shape the message. Personalization tokens stay visible until your send flow supplies them." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StudioField label="Template name" hint="Internal only · 120 characters">
          <Input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} maxLength={120} placeholder="e.g. Reliability introduction" className={CONTROL_CLASS} />
        </StudioField>
        <StudioField label="Outreach objective" hint="Helps operators find the right template">
          <Input value={draft.objective} onChange={(event) => updateDraft('objective', event.target.value)} maxLength={120} placeholder="First touch · platform teams" className={CONTROL_CLASS} />
        </StudioField>
      </div>
      <StudioField label="Subject line" hint={`${draft.subject.length} / 120 recommended characters`}>
        <Input ref={subjectRef} value={draft.subject} onChange={(event) => updateDraft('subject', event.target.value)} maxLength={500} placeholder="A clear, specific reason to open" className={CONTROL_CLASS} />
        <VariableButtons target="subject" addToken={addToken} />
      </StudioField>
      <StudioField label="Inbox preheader" hint="The preview text shown beside the subject">
        <Input value={draft.preheader} onChange={(event) => updateDraft('preheader', event.target.value)} maxLength={180} placeholder="A concise reason to continue reading" className={CONTROL_CLASS} />
      </StudioField>
      <div className="grid gap-4 sm:grid-cols-2">
        <StudioField label="Section marker" hint="A small editorial eyebrow">
          <Input value={draft.eyebrow} onChange={(event) => updateDraft('eyebrow', event.target.value)} maxLength={90} placeholder="INDEPENDENT RELIABILITY INTELLIGENCE" className={CONTROL_CLASS} />
        </StudioField>
        <StudioField label="Headline" hint="The visual lead in the email">
          <Input value={draft.headline} onChange={(event) => updateDraft('headline', event.target.value)} maxLength={140} placeholder="A signal worth acting on." className={CONTROL_CLASS} />
        </StudioField>
      </div>
      <StudioField label="Message body" hint={`${draft.body.length.toLocaleString()} characters · paragraphs are preserved`}>
        <Textarea ref={bodyRef} value={draft.body} onChange={(event) => updateDraft('body', event.target.value)} rows={8} placeholder={'Write a focused, human message…\n\nUse a blank line to start a new paragraph.'} className={`${TEXTAREA_CLASS} min-h-[210px]`} />
        <VariableButtons target="body" addToken={addToken} />
      </StudioField>
      <ToggleRow
        label="Include a primary action"
        description="Add a clear, single next step after the message."
        checked={draft.ctaEnabled}
        onCheckedChange={(checked) => updateDraft('ctaEnabled', checked)}
      />
      {draft.ctaEnabled && (
        <div className="grid gap-4 rounded-xl border border-[#294157] bg-[#0a1928] p-3.5 sm:grid-cols-2">
          <StudioField label="Action label">
            <Input value={draft.ctaLabel} onChange={(event) => updateDraft('ctaLabel', event.target.value)} maxLength={60} placeholder="Open the reliability brief" className={CONTROL_CLASS} />
          </StudioField>
          <StudioField label="Destination URL" hint="Use a full https:// or mailto: address">
            <Input type="url" value={draft.ctaUrl} onChange={(event) => updateDraft('ctaUrl', event.target.value)} placeholder="https://example.com/next-step" className={CONTROL_CLASS} />
          </StudioField>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#263a50] pt-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#70869a]">Copy metrics</span>
        <span className="flex flex-wrap gap-2 text-[10px]">
          <MetricChip label="Words" value={String(draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0)} />
          <MetricChip label="Variables" value={String(extractEmailVariables(draft.subject, draft.preheader, draft.body).length).padStart(2, '0')} />
          <MetricChip label="Subject" value={`${draft.subject.length}/70`} />
        </span>
      </div>
    </div>
  );
}

function IdentityPanel({
  draft,
  updateDraft,
}: {
  draft: OutreachTemplateDraft;
  updateDraft: <K extends keyof OutreachTemplateDraft>(key: K, value: OutreachTemplateDraft[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <PanelIntro icon={PanelTop} kicker="02 / Identity system" title="Make the sender unmistakable." description="Give the message a confident masthead, then close with a signature that feels personal, not automated." />
      <StudioField label="Brand / wordmark" hint="Used in the masthead and footer">
        <Input value={draft.brandName} onChange={(event) => updateDraft('brandName', event.target.value)} maxLength={80} placeholder="Your organization" className={CONTROL_CLASS} />
      </StudioField>
      <div>
        <FieldLabel>Header treatment</FieldLabel>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            ['orbital', 'Orbital', 'Dark mission header'],
            ['precision', 'Precision', 'Quiet wordmark'],
            ['signal', 'Signal', 'Accent command band'],
          ] as const).map(([value, label, description]) => (
            <button key={value} type="button" aria-pressed={draft.headerTreatment === value} onClick={() => updateDraft('headerTreatment', value)} className={`rounded-lg border p-3 text-left transition-colors ${draft.headerTreatment === value ? 'border-[#48bfdf] bg-[#15364b]' : 'border-[#2a4057] bg-[#0a1928] hover:border-[#3c5b74]'}`}>
              <span className={`mb-2 block h-1.5 rounded-full ${value === 'orbital' ? 'bg-[#17374d]' : value === 'precision' ? 'bg-[#46c6e8]' : 'bg-[#e6b15b]'}`} />
              <span className="block text-[11px] font-semibold text-[#e2edf5]">{label}</span>
              <span className="mt-1 block text-[9px] leading-4 text-[#7f96aa]">{description}</span>
            </button>
          ))}
        </div>
      </div>
      <ToggleRow label="Add a human signature" description="Keep the last line personal and easy to reply to." checked={draft.signatureEnabled} onCheckedChange={(checked) => updateDraft('signatureEnabled', checked)} />
      {draft.signatureEnabled && (
        <div className="space-y-4 rounded-xl border border-[#294157] bg-[#0a1928] p-3.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <StudioField label="Sender name"><Input value={draft.signatureName} onChange={(event) => updateDraft('signatureName', event.target.value)} maxLength={100} placeholder="Your name" className={CONTROL_CLASS} /></StudioField>
            <StudioField label="Role / team"><Input value={draft.signatureRole} onChange={(event) => updateDraft('signatureRole', event.target.value)} maxLength={120} placeholder="Partnerships · RELIASTRA" className={CONTROL_CLASS} /></StudioField>
          </div>
          <StudioField label="Reply address" hint="Optional · appears as a clickable email address">
            <Input type="email" value={draft.signatureEmail} onChange={(event) => updateDraft('signatureEmail', event.target.value)} placeholder="name@company.com" className={CONTROL_CLASS} />
          </StudioField>
        </div>
      )}
      <div className="rounded-xl border border-[#2a455b] bg-[#102437] p-3.5">
        <div className="flex items-start gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#5ccfb3]" /><div><p className="text-xs font-semibold text-[#dceaf3]">Trust by design</p><p className="mt-1 text-[11px] leading-5 text-[#8aa1b6]">The builder never inserts a sender identity into a message automatically. Verify the from-address in the Email Center before sending.</p></div></div>
      </div>
    </div>
  );
}

function StylePanel({
  draft,
  updateDraft,
}: {
  draft: OutreachTemplateDraft;
  updateDraft: <K extends keyof OutreachTemplateDraft>(key: K, value: OutreachTemplateDraft[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <PanelIntro icon={Paintbrush2} kicker="03 / Visual system" title="Tune every visual signal." description="Choose a complete color instrument, then adjust individual tokens, typography, width and geometry." />
      <div>
        <div className="flex items-center justify-between gap-2"><FieldLabel>Color instrument</FieldLabel><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#71879a]">{draft.paletteId === 'custom' ? 'Custom mix' : 'Six calibrated palettes'}</span></div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PALETTES.map((palette) => {
            const active = draft.paletteId === palette.id;
            return (
              <button key={palette.id} type="button" aria-pressed={active} onClick={() => {
                updateDraft('paletteId', palette.id);
                updateDraft('accentColor', palette.accent);
                updateDraft('canvasColor', palette.canvas);
                updateDraft('surfaceColor', palette.surface);
                updateDraft('footerBackground', palette.footer);
                updateDraft('textColor', palette.text);
                updateDraft('mutedColor', palette.muted);
              }} className={`rounded-lg border p-2.5 text-left transition-colors ${active ? 'border-[#4dc4e4] bg-[#153247]' : 'border-[#2a4057] bg-[#0a1928] hover:border-[#3a5871]'}`}>
                <span className="flex h-5 overflow-hidden rounded-md border border-white/10"><span style={{ backgroundColor: palette.accent }} className="w-[36%]" /><span style={{ backgroundColor: palette.canvas }} className="flex-1" /><span style={{ backgroundColor: palette.text }} className="w-[18%]" /></span>
                <span className="mt-2 flex items-center justify-between gap-1"><span className="truncate text-[10px] font-semibold text-[#e2edf5]">{palette.name}</span>{active && <Check className="size-3 text-[#69d8bb]" />}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ColorField label="Accent" value={draft.accentColor} onChange={(value) => { updateDraft('accentColor', value); updateDraft('paletteId', 'custom'); }} />
        <ColorField label="Email canvas" value={draft.canvasColor} onChange={(value) => { updateDraft('canvasColor', value); updateDraft('paletteId', 'custom'); }} />
        <ColorField label="Message surface" value={draft.surfaceColor} onChange={(value) => { updateDraft('surfaceColor', value); updateDraft('paletteId', 'custom'); }} />
        <ColorField label="Footer band" value={draft.footerBackground} onChange={(value) => { updateDraft('footerBackground', value); updateDraft('paletteId', 'custom'); }} />
        <ColorField label="Primary text" value={draft.textColor} onChange={(value) => { updateDraft('textColor', value); updateDraft('paletteId', 'custom'); }} />
      </div>
      <div>
        <FieldLabel>Typography</FieldLabel>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            ['command', 'Command', 'Arial · clean'],
            ['editorial', 'Editorial', 'Georgia · considered'],
            ['technical', 'Technical', 'Mono · instrument'],
          ] as const).map(([value, label, detail]) => (
            <button key={value} type="button" aria-pressed={draft.fontPreset === value} onClick={() => updateDraft('fontPreset', value)} className={`rounded-lg border p-2.5 text-left transition-colors ${draft.fontPreset === value ? 'border-[#48bfdf] bg-[#15364b]' : 'border-[#2a4057] bg-[#0a1928] hover:border-[#3c5b74]'}`}>
              <Type className={`mb-2 size-3.5 ${draft.fontPreset === value ? 'text-[#70d8f1]' : 'text-[#71879a]'}`} />
              <span className="block text-[10px] font-semibold text-[#e2edf5]">{label}</span>
              <span className="mt-0.5 block truncate text-[9px] text-[#7f96aa]">{detail}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Email width</FieldLabel>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-[#2a4057] bg-[#0a1928] p-1">
            {([
              [560, 'Focused'],
              [620, 'Standard'],
              [680, 'Wide'],
            ] as const).map(([width, label]) => <button key={width} type="button" aria-pressed={draft.contentWidth === width} onClick={() => updateDraft('contentWidth', width)} className={`rounded-md px-2 py-2 text-[9px] font-semibold transition-colors ${draft.contentWidth === width ? 'bg-[#1a3d54] text-[#9ce7f7]' : 'text-[#7e94a8] hover:text-[#e2edf5]'}`}>{label}<span className="mt-0.5 block font-mono text-[8px] opacity-65">{width}px</span></button>)}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2"><FieldLabel>Corner radius</FieldLabel><span className="font-mono text-[10px] text-[#89a1b5]">{draft.cornerRadius}px</span></div>
          <input type="range" min={0} max={24} step={2} value={draft.cornerRadius} onChange={(event) => updateDraft('cornerRadius', Number(event.target.value))} aria-label="Message corner radius" className="mt-4 w-full accent-[#57cae9]" />
          <div className="mt-1 flex justify-between font-mono text-[8px] uppercase tracking-[0.12em] text-[#637b91]"><span>Hard edge</span><span>Soft edge</span></div>
        </div>
      </div>
      <div className="rounded-xl border border-[#2a455b] bg-[#102437] p-3.5">
        <div className="flex items-start gap-2.5"><Globe2 className="mt-0.5 size-4 shrink-0 text-[#6bcce7]" /><div><p className="text-xs font-semibold text-[#dceaf3]">Built for inboxes, not just browsers</p><p className="mt-1 text-[11px] leading-5 text-[#8aa1b6]">Color and spacing are inlined; the layout uses email-safe tables with no external fonts, scripts or images.</p></div></div>
      </div>
    </div>
  );
}

function FooterPanel({
  draft,
  updateDraft,
}: {
  draft: OutreachTemplateDraft;
  updateDraft: <K extends keyof OutreachTemplateDraft>(key: K, value: OutreachTemplateDraft[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <PanelIntro icon={ShieldCheck} kicker="04 / Footer & trust" title="Leave no loose ends." description="A footer is part of the message. Customize the organization, address, contact paths, social links and opt-out language." />
      <ToggleRow label="Include a custom footer" description="Add your sender details and a clear recipient control." checked={draft.footerEnabled} onCheckedChange={(checked) => updateDraft('footerEnabled', checked)} />
      {draft.footerEnabled ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StudioField label="Organization name"><Input value={draft.brandName} onChange={(event) => updateDraft('brandName', event.target.value)} maxLength={80} placeholder="Your organization" className={CONTROL_CLASS} /></StudioField>
            <StudioField label="Reply-to / contact email"><Input type="email" value={draft.supportEmail} onChange={(event) => updateDraft('supportEmail', event.target.value)} placeholder="team@company.com" className={CONTROL_CLASS} /></StudioField>
          </div>
          <StudioField label="Postal address" hint="A transparent sender address strengthens trust">
            <Input value={draft.postalAddress} onChange={(event) => updateDraft('postalAddress', event.target.value)} maxLength={240} placeholder="Organization · city, region, country" className={CONTROL_CLASS} />
          </StudioField>
          <div className="grid gap-4 sm:grid-cols-2">
            <StudioField label="Website"><Input type="url" value={draft.websiteUrl} onChange={(event) => updateDraft('websiteUrl', event.target.value)} placeholder="https://company.com" className={CONTROL_CLASS} /></StudioField>
            <StudioField label="LinkedIn · optional"><Input type="url" value={draft.linkedInUrl} onChange={(event) => updateDraft('linkedInUrl', event.target.value)} placeholder="https://linkedin.com/company/..." className={CONTROL_CLASS} /></StudioField>
          </div>
          <StudioField label="X / social · optional"><Input type="url" value={draft.xUrl} onChange={(event) => updateDraft('xUrl', event.target.value)} placeholder="https://x.com/yourcompany" className={CONTROL_CLASS} /></StudioField>
          <StudioField label="Context line" hint="Explain why this recipient is hearing from you">
            <Textarea value={draft.footerNote} onChange={(event) => updateDraft('footerNote', event.target.value)} rows={2} maxLength={300} placeholder="You are receiving this note because…" className={`${TEXTAREA_CLASS} min-h-[76px]`} />
          </StudioField>
          <div>
            <FieldLabel>Footer alignment</FieldLabel>
            <div className="mt-2 inline-flex rounded-lg border border-[#2a4057] bg-[#0a1928] p-1">
              {(['left', 'center'] as const).map((alignment) => <button key={alignment} type="button" aria-pressed={draft.footerAlignment === alignment} onClick={() => updateDraft('footerAlignment', alignment)} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold capitalize transition-colors ${draft.footerAlignment === alignment ? 'bg-[#1a3d54] text-[#a4e8f6]' : 'text-[#8198ac] hover:text-white'}`}>{alignment}</button>)}
            </div>
          </div>
          <div className="rounded-xl border border-[#294157] bg-[#0a1928] p-3.5">
            <ToggleRow label="Add an opt-out path" description="Keep an easy, visible way to decline future messages." checked={draft.unsubscribeEnabled} onCheckedChange={(checked) => updateDraft('unsubscribeEnabled', checked)} />
            {draft.unsubscribeEnabled && <div className="mt-4 grid gap-4 border-t border-[#253a4f] pt-4 sm:grid-cols-2"><StudioField label="Opt-out wording"><Input value={draft.unsubscribeText} onChange={(event) => updateDraft('unsubscribeText', event.target.value)} maxLength={120} placeholder="Unsubscribe" className={CONTROL_CLASS} /></StudioField><StudioField label="Opt-out destination" hint="Use https:// or mailto:"><Input value={draft.unsubscribeUrl} onChange={(event) => updateDraft('unsubscribeUrl', event.target.value)} placeholder="mailto:team@company.com?subject=Unsubscribe" className={CONTROL_CLASS} /></StudioField></div>}
          </div>
          <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-3 ${draft.unsubscribeEnabled && draft.postalAddress.trim() ? 'border-[#285848] bg-[#102d2c]/60' : 'border-[#67513b] bg-[#33291d]/55'}`}>
            {draft.unsubscribeEnabled && draft.postalAddress.trim() ? <Check className="mt-0.5 size-3.5 shrink-0 text-[#65d5b9]" /> : <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#e9bd73]" />}
            <p className="text-[10px] leading-5 text-[#a4b4c3]">{draft.unsubscribeEnabled && draft.postalAddress.trim() ? 'Footer essentials are present. Review the final wording against your organization’s outreach policy.' : 'For a complete footer, add a postal address and keep the opt-out path enabled. Always confirm local outreach requirements.'}</p>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-[#40566d] bg-[#0a1928] px-4 py-5 text-center"><p className="text-xs font-semibold text-[#dae6ef]">Footer currently omitted</p><p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[#8197ab]">Your footer fields are preserved. Switch it back on to restore the full identity and opt-out block.</p></div>
      )}
    </div>
  );
}

function ReadinessPanel({
  subjectLength,
  wordCount,
  variables,
  footerReady,
  footerEnabled,
}: {
  subjectLength: number;
  wordCount: number;
  variables: string[];
  footerReady: boolean;
  footerEnabled: boolean;
}) {
  const checks = [
    { label: 'Subject line', value: subjectLength > 0 ? `${subjectLength} characters` : 'Add a subject', status: subjectLength > 0 && subjectLength <= 70 },
    { label: 'Message length', value: wordCount > 0 ? `${wordCount} words` : 'Add message copy', status: wordCount > 0 && wordCount <= 220 },
    { label: 'Footer controls', value: !footerEnabled ? 'Footer disabled' : footerReady ? 'Address + opt-out' : 'Review footer', status: footerReady },
  ];
  return (
    <div className="rounded-2xl border border-[#294057] bg-[#0e1e2f]/95 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#62cce9]">Pre-flight review</p><h3 className="mt-1 text-sm font-semibold text-[#e7f1f7]">Message integrity</h3></div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${checks.every((item) => item.status) ? 'border-[#2d6455] bg-[#12342e] text-[#78d8bb]' : 'border-[#6a5439] bg-[#362b1d] text-[#e6c27e]'}`}><span className="size-1.5 rounded-full bg-current" />{checks.every((item) => item.status) ? 'Ready for review' : 'Review signals'}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {checks.map((item) => <div key={item.label} className="rounded-lg border border-[#263c52] bg-[#0a1928] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#748ba0]">{item.label}</p><p className={`mt-1.5 flex items-center gap-1.5 text-[10px] font-medium ${item.status ? 'text-[#c3d5e2]' : 'text-[#e5bd7c]'}`}>{item.status ? <Check className="size-3 text-[#59d3b5]" /> : <span className="size-1.5 rounded-full bg-[#e5bd7c]" />}{item.value}</p></div>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#263b51] pt-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#6f879c]">Detected tokens</span>
        {variables.length ? variables.map((name) => <span key={name} className="rounded border border-[#2d475f] bg-[#11263a] px-1.5 py-0.5 font-mono text-[9px] text-[#a3cce0]">{'{{'}{name}{'}}'}</span>) : <span className="text-[10px] text-[#71889d]">No dynamic fields yet</span>}
      </div>
    </div>
  );
}

function PanelIntro({ icon: Icon, kicker, title, description }: { icon: typeof FileText; kicker: string; title: string; description: string }) {
  return (
    <div className="flex gap-3 border-b border-[#253a50] pb-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#315069] bg-[#112a3d] text-[#69d5ef]"><Icon className="size-4" /></span>
      <div><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-[#6ccce7]">{kicker}</p><h3 className="mt-1 text-base font-semibold tracking-[-0.025em] text-[#edf5fb]">{title}</h3><p className="mt-1 max-w-xl text-[11px] leading-5 text-[#8298ad]">{description}</p></div>
    </div>
  );
}

function StudioField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const fieldId = useId();
  const controls = Children.map(children, (child, index) => {
    if (index === 0 && isValidElement(child) && typeof child.type !== 'string') {
      return cloneElement(child as ReactElement<{ id?: string }>, { id: fieldId });
    }
    return child;
  });
  return <div className="min-w-0 space-y-1.5"><div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1"><label htmlFor={fieldId} className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9bb0c2]">{label}</label>{hint && <span className="text-[9px] text-[#71879b]">{hint}</span>}</div>{controls}</div>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9bb0c2]">{children}</span>;
}

function VariableButtons({ target, addToken }: { target: 'subject' | 'body'; addToken: (target: 'subject' | 'body', name: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6d8498]">Insert</span>
      {INSERTABLE_VARIABLES.map((name) => <button key={name} type="button" onClick={() => addToken(target, name)} className="rounded border border-[#2b4258] bg-[#102033] px-1.5 py-1 font-mono text-[9px] text-[#9ec8dc] transition-colors hover:border-[#40839c] hover:bg-[#133349] hover:text-[#d5f5ff]">{'{{'}{name}{'}}'}</button>)}
    </div>
  );
}

function ToggleRow({ label, description, checked, onCheckedChange }: { label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#294157] bg-[#0a1928] px-3.5 py-3">
      <div className="min-w-0"><p className="text-[11px] font-semibold text-[#dce8f0]">{label}</p><p className="mt-1 text-[10px] leading-4 text-[#7e95a9]">{description}</p></div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onCheckedChange(!checked)} className={`relative h-[22px] w-10 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5dcee9]/60 ${checked ? 'border-[#4bc0df] bg-[#27738b]' : 'border-[#40556a] bg-[#223449]'}`}><span className={`absolute top-[3px] size-3.5 rounded-full bg-[#f5fbff] shadow-sm transition-all ${checked ? 'left-[21px]' : 'left-[3px]'}`} /></button>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [hex, setHex] = useState(value);
  const normalized = isHexColor(value) ? value : '#ffffff';
  useEffect(() => setHex(value), [value]);
  return (
    <label className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#2a4057] bg-[#0a1928] px-2.5 py-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#91a6b8]">{label}</span>
      <span className="flex items-center gap-1.5"><input type="color" aria-label={`${label} color`} value={normalized} onChange={(event) => onChange(event.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" /><input aria-label={`${label} hex value`} value={hex} onChange={(event) => { setHex(event.target.value); if (isHexColor(event.target.value)) onChange(event.target.value); }} onBlur={() => { if (!isHexColor(hex)) setHex(value); }} className="w-[68px] bg-transparent text-right font-mono text-[9px] uppercase text-[#c8d6e2] outline-none" /></span>
    </label>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return <span className="rounded border border-[#2a4057] bg-[#0a1928] px-1.5 py-1 font-mono text-[9px] text-[#95a9bb]"><span className="text-[#647d93]">{label}</span> <span className="text-[#d1e2ee]">{value}</span></span>;
}

function isOutreachStudioTemplate(template: EmailCenterTemplate) {
  return template.html_body.includes(STUDIO_MARKER);
}

function getValidationIssue(draft: OutreachTemplateDraft): string | null {
  if (!draft.name.trim()) return 'Name this template before saving.';
  if (!draft.subject.trim()) return 'Add a subject line before saving.';
  if (!draft.body.trim()) return 'Add a message body before saving.';
  if (draft.ctaEnabled && !isSafeEmailUrl(draft.ctaUrl)) return 'Add a valid https:// or mailto: destination for the primary action.';
  if (draft.signatureEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.signatureEmail.trim())) return 'The signature reply address is not valid.';
  if (draft.footerEnabled && draft.supportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.supportEmail.trim())) return 'The footer contact email is not valid.';
  if (draft.unsubscribeEnabled && !isSafeEmailUrl(draft.unsubscribeUrl)) return 'Add a valid https:// or mailto: opt-out destination.';
  if (draft.websiteUrl.trim() && !isSafeEmailUrl(draft.websiteUrl)) return 'The website destination must begin with https:// or mailto:.';
  if (draft.linkedInUrl.trim() && !isSafeEmailUrl(draft.linkedInUrl)) return 'The LinkedIn destination must begin with https:// or mailto:.';
  if (draft.xUrl.trim() && !isSafeEmailUrl(draft.xUrl)) return 'The social destination must begin with https:// or mailto:.';
  return null;
}

function isSafeEmailUrl(value: string) {
  return /^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(value.trim());
}

function templatePayload(draft: OutreachTemplateDraft) {
  return {
    name: draft.name.trim().slice(0, 120),
    description: `${OUTREACH_DESCRIPTION}${draft.objective.trim() || 'Direct prospecting'}`.slice(0, 500),
    subject: draft.subject.trim(),
    text_body: buildOutreachText(draft),
    html_body: buildOutreachEmailHtml(draft),
  };
}

export function buildOutreachText(draft: OutreachTemplateDraft) {
  const sections: string[] = [];
  if (draft.preheader.trim()) sections.push(draft.preheader.trim());
  if (draft.headline.trim()) sections.push(draft.headline.trim());
  if (draft.body.trim()) sections.push(draft.body.trim());
  if (draft.ctaEnabled) sections.push(`${draft.ctaLabel.trim() || 'Learn more'}\n${draft.ctaUrl.trim()}`);
  if (draft.signatureEnabled) {
    const signature = [draft.signatureName.trim(), draft.signatureRole.trim(), draft.signatureEmail.trim()].filter(Boolean).join('\n');
    if (signature) sections.push(signature);
  }
  if (draft.footerEnabled) {
    const footer = [
      draft.brandName.trim(),
      draft.footerNote.trim(),
      draft.postalAddress.trim(),
      draft.supportEmail.trim(),
      draft.websiteUrl.trim(),
      draft.linkedInUrl.trim() ? `LinkedIn: ${draft.linkedInUrl.trim()}` : '',
      draft.xUrl.trim() ? `Social: ${draft.xUrl.trim()}` : '',
      draft.unsubscribeEnabled ? `${draft.unsubscribeText.trim()}\n${draft.unsubscribeUrl.trim()}` : '',
    ].filter(Boolean).join('\n');
    if (footer) sections.push(footer);
  }
  return sections.join('\n\n');
}

export function buildOutreachEmailHtml(draft: OutreachTemplateDraft) {
  const accent = normalizedColor(draft.accentColor, '#45c7ef');
  const canvas = normalizedColor(draft.canvasColor, '#eaf1f8');
  const surface = normalizedColor(draft.surfaceColor, '#ffffff');
  const text = normalizedColor(draft.textColor, '#10243a');
  const muted = normalizedColor(draft.mutedColor, '#60748a');
  const width = draft.contentWidth;
  const radius = Math.max(0, Math.min(24, Number(draft.cornerRadius) || 0));
  const font = fontFamily(draft.fontPreset);
  const meta = encodeConfig(draft);
  const containerClass = `${STUDIO_MARKER} ${CONFIG_MARKER}${meta}`;
  const header = renderEmailHeader(draft, accent, surface, text, font);
  const paragraphs = draft.body
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p class="rs-body-copy" style="margin:0 0 17px;color:${text};font-family:${font};font-size:15px;line-height:1.75;">${escapeEmailText(paragraph).replace(/\r?\n/g, '<br />')}</p>`)
    .join('');
  const action = draft.ctaEnabled
    ? `<tr><td class="rs-action-row" align="left" style="padding:4px 0 27px;"><a class="rs-cta" href="${escapeEmailAttribute(draft.ctaUrl.trim())}" style="display:inline-block;border-radius:6px;background:${accent};color:#071725;font-family:${font};font-size:12px;font-weight:700;letter-spacing:.02em;line-height:1.2;padding:13px 18px;text-decoration:none;">${escapeEmailText(draft.ctaLabel.trim() || 'Learn more')}</a></td></tr>`
    : '';
  const signature = draft.signatureEnabled
    ? `<tr><td style="border-top:1px solid #e2e8ef;padding:19px 0 0;"><p style="margin:0 0 4px;color:${text};font-family:${font};font-size:13px;line-height:1.5;">With respect,</p>${draft.signatureName.trim() ? `<p class="rs-signature-name" style="margin:0;color:${text};font-family:${font};font-size:13px;font-weight:700;line-height:1.5;">${escapeEmailText(draft.signatureName)}</p>` : ''}${draft.signatureRole.trim() ? `<p class="rs-signature-role" style="margin:1px 0 0;color:${muted};font-family:${font};font-size:11px;line-height:1.6;">${escapeEmailText(draft.signatureRole)}</p>` : ''}${draft.signatureEmail.trim() ? `<p style="margin:2px 0 0;font-family:${font};font-size:11px;line-height:1.5;"><a class="rs-signature-email" href="mailto:${escapeEmailAttribute(draft.signatureEmail.trim())}" style="color:${accent};text-decoration:none;">${escapeEmailText(draft.signatureEmail)}</a></p>` : ''}</td></tr>`
    : '';
  const footer = draft.footerEnabled ? renderEmailFooter(draft, accent, muted, font) : '';
  return `<div class="${containerClass}" style="margin:0;padding:0;background-color:${canvas};"><div class="rs-preheader" style="display:none!important;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:transparent;">${escapeEmailText(draft.preheader)}</div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${canvas}" style="width:100%;border-collapse:collapse;background-color:${canvas};"><tbody><tr><td align="center" style="padding:30px 12px 34px;"><table class="rs-email-shell" width="${width}" cellpadding="0" cellspacing="0" border="0" bgcolor="${surface}" style="width:100%;max-width:${width}px;border-collapse:separate;border-spacing:0;border-radius:${radius}px;background-color:${surface};overflow:hidden;"><tbody><tr><td height="4" bgcolor="${accent}" style="height:4px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>${header}<tr><td style="padding:30px 36px 28px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody><tr><td>${draft.eyebrow.trim() ? `<p class="rs-eyebrow" style="margin:0 0 11px;color:${accent};font-family:${font};font-size:9px;font-weight:700;letter-spacing:.16em;line-height:1.5;text-transform:uppercase;">${escapeEmailText(draft.eyebrow)}</p>` : ''}${draft.headline.trim() ? `<h1 class="rs-headline" style="margin:0 0 22px;color:${text};font-family:${font};font-size:27px;font-weight:700;letter-spacing:-.035em;line-height:1.2;">${escapeEmailText(draft.headline)}</h1>` : ''}<div class="rs-body" style="color:${text};font-family:${font};font-size:15px;line-height:1.75;">${paragraphs}</div></td></tr>${action}${signature}</tbody></table></td></tr>${footer}</tbody></table><p style="margin:13px 0 0;color:${muted};font-family:${font};font-size:9px;letter-spacing:.08em;line-height:1.5;text-align:center;text-transform:uppercase;">A considered note · sent with intent</p></td></tr></tbody></table></div>`;
}

function renderEmailHeader(draft: OutreachTemplateDraft, accent: string, surface: string, text: string, font: string) {
  const brand = escapeEmailText(draft.brandName.trim() || 'RELIASTRA');
  if (draft.headerTreatment === 'precision') {
    return `<tr><td bgcolor="${surface}" style="padding:24px 36px 18px;background-color:${surface};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody><tr><td align="left"><p class="rs-brand-name" style="margin:0;color:${text};font-family:${font};font-size:12px;font-weight:800;letter-spacing:.18em;line-height:1.5;">${brand}</p><p style="margin:4px 0 0;color:${accent};font-family:${font};font-size:8px;font-weight:700;letter-spacing:.16em;line-height:1.5;text-transform:uppercase;">FIELD NOTES / OUTREACH</p></td><td align="right" valign="middle"><span style="display:inline-block;border:1px solid ${accent};border-radius:999px;color:${text};font-family:${font};font-size:8px;font-weight:700;letter-spacing:.1em;padding:6px 8px;">DIRECT</span></td></tr></tbody></table></td></tr>`;
  }
  if (draft.headerTreatment === 'signal') {
    return `<tr><td bgcolor="${accent}" style="padding:24px 36px 21px;background-color:${accent};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody><tr><td><p class="rs-brand-name" style="margin:0;color:#071725;font-family:${font};font-size:12px;font-weight:800;letter-spacing:.18em;line-height:1.5;">${brand}</p><p style="margin:5px 0 0;color:#17364a;font-family:${font};font-size:8px;font-weight:700;letter-spacing:.15em;line-height:1.5;text-transform:uppercase;">SYSTEM / 01 · PERSONAL OUTREACH</p></td><td align="right" valign="middle"><span style="font-family:${font};font-size:9px;font-weight:700;letter-spacing:.12em;color:#071725;">01 — 04</span></td></tr></tbody></table></td></tr>`;
  }
  return `<tr><td bgcolor="#0c2034" style="padding:23px 36px 22px;background-color:#0c2034;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody><tr><td><p class="rs-brand-name" style="margin:0;color:#f0f7fb;font-family:${font};font-size:12px;font-weight:800;letter-spacing:.18em;line-height:1.5;">${brand}</p><p style="margin:5px 0 0;color:${accent};font-family:${font};font-size:8px;font-weight:700;letter-spacing:.16em;line-height:1.5;text-transform:uppercase;">FIELD INTELLIGENCE / DIRECT OUTREACH</p></td><td align="right" valign="middle"><span style="display:inline-block;border:1px solid #385067;border-radius:5px;color:#a9bdcd;font-family:${font};font-size:8px;letter-spacing:.13em;padding:6px 8px;">NO. 01</span></td></tr></tbody></table></td></tr>`;
}

function renderEmailFooter(draft: OutreachTemplateDraft, accent: string, muted: string, font: string) {
  const alignment = draft.footerAlignment;
  const footerBackground = normalizedColor(draft.footerBackground, '#f3f6f9');
  const brand = draft.brandName.trim() || 'RELIASTRA';
  const links = [
    safeAnchor(draft.websiteUrl, 'Website', accent, font, 'rs-footer-website'),
    safeAnchor(draft.linkedInUrl, 'LinkedIn', accent, font, 'rs-footer-linkedin'),
    safeAnchor(draft.xUrl, 'Social', accent, font, 'rs-footer-social'),
  ].filter(Boolean).join('<span style="padding:0 7px;color:#a9b6c4;">·</span>');
  const emailLink = draft.supportEmail.trim()
    ? `<a class="rs-footer-email" href="mailto:${escapeEmailAttribute(draft.supportEmail.trim())}" style="color:${accent};font-family:${font};font-size:10px;text-decoration:none;">${escapeEmailText(draft.supportEmail.trim())}</a>`
    : '';
  const optOut = draft.unsubscribeEnabled && draft.unsubscribeText.trim()
    ? `<p style="margin:11px 0 0;color:${muted};font-family:${font};font-size:10px;line-height:1.6;"><a class="rs-unsubscribe" href="${escapeEmailAttribute(draft.unsubscribeUrl.trim())}" style="color:${accent};font-family:${font};font-size:10px;text-decoration:underline;text-underline-offset:2px;">${escapeEmailText(draft.unsubscribeText.trim())}</a></p>`
    : '';
  return `<tr><td class="rs-footer" align="${alignment}" bgcolor="${footerBackground}" style="padding:22px 36px 24px;border-top:1px solid #e1e8ef;background-color:${footerBackground};text-align:${alignment};"><p class="rs-footer-brand" style="margin:0;color:#33475b;font-family:${font};font-size:9px;font-weight:800;letter-spacing:.16em;line-height:1.6;text-transform:uppercase;">${escapeEmailText(brand)}</p>${draft.footerNote.trim() ? `<p class="rs-footer-note" style="margin:7px 0 0;color:${muted};font-family:${font};font-size:10px;line-height:1.6;">${escapeEmailText(draft.footerNote)}</p>` : ''}${draft.postalAddress.trim() ? `<p class="rs-footer-address" style="margin:7px 0 0;color:${muted};font-family:${font};font-size:10px;line-height:1.6;">${escapeEmailText(draft.postalAddress)}</p>` : ''}${emailLink || links ? `<p style="margin:7px 0 0;color:${muted};font-family:${font};font-size:10px;line-height:1.7;">${emailLink}${emailLink && links ? '<span style="padding:0 7px;color:#a9b6c4;">·</span>' : ''}${links}</p>` : ''}${optOut}</td></tr>`;
}

function safeAnchor(url: string, label: string, accent: string, font: string, className: string) {
  const target = url.trim();
  if (!target || !isSafeEmailUrl(target)) return '';
  return `<a class="${className}" href="${escapeEmailAttribute(target)}" style="color:${accent};font-family:${font};font-size:10px;text-decoration:none;">${escapeEmailText(label)}</a>`;
}

export function encodeConfig(draft: OutreachTemplateDraft) {
  const config = {
    version: 1,
    objective: draft.objective,
    ctaEnabled: draft.ctaEnabled,
    ctaLabel: draft.ctaLabel,
    ctaUrl: draft.ctaUrl,
    brandName: draft.brandName,
    headerTreatment: draft.headerTreatment,
    signatureEnabled: draft.signatureEnabled,
    signatureName: draft.signatureName,
    signatureRole: draft.signatureRole,
    signatureEmail: draft.signatureEmail,
    paletteId: draft.paletteId,
    accentColor: draft.accentColor,
    canvasColor: draft.canvasColor,
    surfaceColor: draft.surfaceColor,
    footerBackground: draft.footerBackground,
    textColor: draft.textColor,
    mutedColor: draft.mutedColor,
    fontPreset: draft.fontPreset,
    contentWidth: draft.contentWidth,
    cornerRadius: draft.cornerRadius,
    footerEnabled: draft.footerEnabled,
    footerAlignment: draft.footerAlignment,
    footerNote: draft.footerNote,
    postalAddress: draft.postalAddress,
    supportEmail: draft.supportEmail,
    websiteUrl: draft.websiteUrl,
    linkedInUrl: draft.linkedInUrl,
    xUrl: draft.xUrl,
    unsubscribeEnabled: draft.unsubscribeEnabled,
    unsubscribeText: draft.unsubscribeText,
    unsubscribeUrl: draft.unsubscribeUrl,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += alphabet[(buffer >> bits) & 63];
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0) result += alphabet[(buffer << (6 - bits)) & 63];
  return result;
}

export function decodeConfig(value: string): Partial<OutreachTemplateDraft> | null {
  try {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const character of value) {
      const digit = alphabet.indexOf(character);
      if (digit < 0) return null;
      buffer = (buffer << 6) | digit;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 255);
        buffer &= (1 << bits) - 1;
      }
    }
    const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as Record<string, unknown>;
    if (parsed.version !== 1) return null;
    return parsed as Partial<OutreachTemplateDraft>;
  } catch {
    return null;
  }
}

function draftFromTemplate(template: EmailCenterTemplate): OutreachTemplateDraft {
  const document = new DOMParser().parseFromString(template.html_body || '', 'text/html');
  const match = template.html_body.match(new RegExp(`${CONFIG_MARKER}([A-Za-z0-9_-]+)`));
  const config = match ? decodeConfig(match[1]) : null;
  const safeConfig = sanitizeConfig(config);
  const textAt = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? '';
  const preheaderElement = document.querySelector('.rs-preheader');
  const signatureNameElement = document.querySelector('.rs-signature-name');
  const signatureRoleElement = document.querySelector('.rs-signature-role');
  const signatureEmailElement = document.querySelector('.rs-signature-email');
  const bodyParts = Array.from(document.querySelectorAll('.rs-body-copy')).map((paragraph) => {
    const clone = paragraph.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith(document.createTextNode('\n')));
    return clone.textContent?.trim() ?? '';
  }).filter(Boolean);
  const action = document.querySelector('.rs-cta');
  const signatureName = textAt('.rs-signature-name');
  const signatureRole = textAt('.rs-signature-role');
  const signatureEmail = textAt('.rs-signature-email');
  const description = template.description?.startsWith(OUTREACH_DESCRIPTION)
    ? template.description.slice(OUTREACH_DESCRIPTION.length)
    : safeConfig.objective;
  return {
    ...DEFAULT_DRAFT,
    ...safeConfig,
    name: template.name,
    objective: description || DEFAULT_DRAFT.objective,
    subject: template.subject || DEFAULT_DRAFT.subject,
    preheader: preheaderElement ? preheaderElement.textContent?.trim() ?? '' : DEFAULT_DRAFT.preheader,
    eyebrow: textAt('.rs-eyebrow') || '',
    headline: textAt('.rs-headline') || '',
    body: bodyParts.length ? bodyParts.join('\n\n') : template.text_body || DEFAULT_DRAFT.body,
    brandName: textAt('.rs-brand-name') || safeConfig.brandName || DEFAULT_DRAFT.brandName,
    ctaEnabled: Boolean(action) || Boolean(safeConfig.ctaEnabled),
    ctaLabel: action?.textContent?.trim() || safeConfig.ctaLabel || DEFAULT_DRAFT.ctaLabel,
    ctaUrl: action?.getAttribute('href') || safeConfig.ctaUrl || DEFAULT_DRAFT.ctaUrl,
    signatureName: signatureNameElement ? signatureName : safeConfig.signatureName ?? DEFAULT_DRAFT.signatureName,
    signatureRole: signatureRoleElement ? signatureRole : safeConfig.signatureRole ?? DEFAULT_DRAFT.signatureRole,
    signatureEmail: signatureEmailElement ? signatureEmail : safeConfig.signatureEmail ?? DEFAULT_DRAFT.signatureEmail,
  };
}

function sanitizeConfig(config: Partial<OutreachTemplateDraft> | null): Partial<OutreachTemplateDraft> {
  if (!config) return {};
  const safe: Partial<OutreachTemplateDraft> = {};
  const stringKeys: Array<keyof OutreachTemplateDraft> = [
    'objective', 'ctaLabel', 'ctaUrl', 'brandName', 'signatureName', 'signatureRole', 'signatureEmail',
    'accentColor', 'canvasColor', 'surfaceColor', 'footerBackground', 'textColor', 'mutedColor', 'footerNote', 'postalAddress',
    'supportEmail', 'websiteUrl', 'linkedInUrl', 'xUrl', 'unsubscribeText', 'unsubscribeUrl',
  ];
  for (const key of stringKeys) {
    const value = config[key];
    if (typeof value === 'string') (safe as Record<string, unknown>)[key] = value;
  }
  if (config.paletteId && [...PALETTES.map((palette) => palette.id), 'custom'].includes(config.paletteId)) safe.paletteId = config.paletteId;
  if (config.fontPreset && ['command', 'editorial', 'technical'].includes(config.fontPreset)) safe.fontPreset = config.fontPreset;
  if (config.headerTreatment && ['orbital', 'precision', 'signal'].includes(config.headerTreatment)) safe.headerTreatment = config.headerTreatment;
  if (config.contentWidth && [560, 620, 680].includes(config.contentWidth)) safe.contentWidth = config.contentWidth;
  if (typeof config.cornerRadius === 'number' && config.cornerRadius >= 0 && config.cornerRadius <= 24) safe.cornerRadius = config.cornerRadius;
  if (config.footerAlignment && ['left', 'center'].includes(config.footerAlignment)) safe.footerAlignment = config.footerAlignment;
  const booleanKeys: Array<keyof OutreachTemplateDraft> = ['ctaEnabled', 'signatureEnabled', 'footerEnabled', 'unsubscribeEnabled'];
  for (const key of booleanKeys) {
    const value = config[key];
    if (typeof value === 'boolean') (safe as Record<string, unknown>)[key] = value;
  }
  for (const key of ['accentColor', 'canvasColor', 'surfaceColor', 'footerBackground', 'textColor', 'mutedColor'] as const) {
    if (safe[key] && !isHexColor(safe[key]!)) safe[key] = DEFAULT_DRAFT[key];
  }
  for (const key of ['ctaUrl', 'websiteUrl', 'linkedInUrl', 'xUrl', 'unsubscribeUrl'] as const) {
    if (safe[key] && !isSafeEmailUrl(safe[key]!)) safe[key] = DEFAULT_DRAFT[key];
  }
  return safe;
}

function wrapEmailPreview(html: string, canvasColor: string) {
  const background = normalizedColor(canvasColor, '#eaf1f8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>html,body{margin:0;min-height:100%;background:${background};}body{font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;}table{max-width:100%;}a{cursor:pointer;}</style></head><body>${html}</body></html>`;
}

function fontFamily(preset: FontPreset) {
  if (preset === 'editorial') return "Georgia, 'Times New Roman', serif";
  if (preset === 'technical') return "'SFMono-Regular', Consolas, 'Liberation Mono', monospace";
  return "Arial, Helvetica, 'Segoe UI', sans-serif";
}

function normalizedColor(value: string, fallback: string) {
  return isHexColor(value) ? value : fallback;
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function escapeEmailText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeEmailAttribute(value: string) {
  return escapeEmailText(value.trim());
}
