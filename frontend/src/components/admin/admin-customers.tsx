'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  PencilLine,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  UserRoundCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import {
  formatAdminCurrency,
  formatAdminDate,
  formatCompactNumber,
  formatRelativeTime,
  humanize,
} from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import type { CustomerDetailResponse } from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  ImpactDialog,
  Pagination,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PAGE_SIZE = 20;

function useUrlUpdater() {
  const router = useRouter();
  const params = useSearchParams();
  return (changes: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    });
    router.replace(`/admin/customers${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  };
}

export function CustomerListPage() {
  const params = useSearchParams();
  const updateUrl = useUrlUpdater();
  const initialSearch = params.get('search') || '';
  const [search, setSearch] = useState(initialSearch);
  const page = Math.max(1, Number(params.get('page') || 1));
  const status = params.get('status') || 'all';
  const health = params.get('health') || 'all';
  const plan = params.get('plan') || '';

  useEffect(() => setSearch(initialSearch), [initialSearch]);

  const queryParams = useMemo(
    () => ({
      search: initialSearch || undefined,
      status: status === 'all' ? undefined : status,
      health: health === 'all' ? undefined : health,
      plan: plan || undefined,
      page,
      page_size: PAGE_SIZE,
      sort: 'created_at_desc',
    }),
    [health, initialSearch, page, plan, status]
  );

  const customersQuery = useQuery({
    queryKey: ['admin', 'customers', queryParams],
    queryFn: () => adminApi.customers(queryParams),
    staleTime: 30_000,
  });

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateUrl({ search: search.trim() || null, page: null });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Business / Customers"
        title="Customers"
        description="Find the account behind the signal, then see its organization, plan, usage, support, and activity as one connected picture."
      />

      <AdminCard>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-white/10 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2 lg:max-w-lg">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, or organization"
                className="h-10 pl-9"
                aria-label="Search customers"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10">Search</Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="Status"
              value={status}
              onValueChange={(value) => updateUrl({ status: value, page: null })}
              options={[
                ['all', 'All status'],
                ['active', 'Active'],
                ['inactive', 'Inactive'],
              ]}
            />
            <FilterSelect
              label="Health"
              value={health}
              onValueChange={(value) => updateUrl({ health: value, page: null })}
              options={[
                ['all', 'All health'],
                ['healthy', 'Healthy'],
                ['at_risk', 'At risk'],
                ['churning', 'Churning'],
                ['inactive', 'Inactive'],
              ]}
            />
            <div className="relative hidden sm:block">
              <Input
                value={plan}
                onChange={(event) => updateUrl({ plan: event.target.value || null, page: null })}
                placeholder="Plan"
                className="h-9 w-28 text-xs"
                aria-label="Filter by plan"
              />
            </div>
          </div>
        </div>
        {customersQuery.isLoading && <SectionSkeleton lines={8} />}
        {customersQuery.isError && (
          <SectionFailure
            title="Customers are unavailable."
            description="The customer list could not be loaded. Other admin areas remain available."
            onRetry={() => customersQuery.refetch()}
          />
        )}
        {customersQuery.data && customersQuery.data.items.length === 0 && (
          <AdminEmptyState
            title={initialSearch || health !== 'all' || status !== 'all' || plan ? 'No customers match these filters.' : 'No customers yet.'}
            description={initialSearch || health !== 'all' || status !== 'all' || plan ? 'Try broadening the current filters, or clear the search to see all customers.' : 'Once people create RELIASTRA accounts, their organization and product context will appear here.'}
            icon={UserRound}
            action={(initialSearch || health !== 'all' || status !== 'all' || plan) ? <Button variant="outline" onClick={() => updateUrl({ search: null, health: null, status: null, plan: null, page: null })}>Clear filters</Button> : undefined}
          />
        )}
        {customersQuery.data && customersQuery.data.items.length > 0 && (
          <>
            <CustomerTable items={customersQuery.data.items} />
            <Pagination
              page={customersQuery.data.page}
              pageSize={customersQuery.data.page_size}
              total={customersQuery.data.total}
              onPageChange={(nextPage) => updateUrl({ page: String(nextPage) })}
            />
          </>
        )}
      </AdminCard>
    </div>
  );
}

function UsersRoundIcon({ className }: { className?: string }) {
  return <UserRound className={className} />;
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger size="sm" className="gap-1.5 text-xs">
        <SlidersHorizontal className="size-3" />
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CustomerTable({
  items,
}: {
  items: Awaited<ReturnType<typeof adminApi.customers>>['items'];
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[780px] text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]">
              {['Customer', 'Organization', 'Plan', 'MRR', 'Last activity', 'Health', ''].map((heading) => (
                <th key={heading || 'action'} className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((customer) => (
              <tr key={customer.customer_id} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]">
                <td className="px-5 py-4">
                  <Link href={`/admin/customers/${customer.customer_id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{customer.full_name || customer.email}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{customer.email}</span>
                  </Link>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{customer.org_name || '—'}</td>
                <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{customer.plan ? humanize(customer.plan) : '—'}</td>
                <td className="px-5 py-4 text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">{formatAdminCurrency(customer.mrr)}</td>
                <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{customer.last_activity_at ? formatRelativeTime(customer.last_activity_at) : '—'}</td>
                <td className="px-5 py-4"><StatusPill status={customer.health} /></td>
                <td className="px-5 py-4 text-right"><Link href={`/admin/customers/${customer.customer_id}`} className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-white/10 dark:hover:text-white" aria-label={`Open ${customer.full_name || customer.email}`}><ArrowRight className="size-3.5" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden dark:divide-white/10">
        {items.map((customer) => (
          <Link key={customer.customer_id} href={`/admin/customers/${customer.customer_id}`} className="block px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{customer.full_name || customer.email}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{customer.org_name || customer.email}</p>
              </div>
              <StatusPill status={customer.health} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">{customer.plan ? humanize(customer.plan) : 'No plan'}</span>
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatAdminCurrency(customer.mrr)}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [noteOpen, setNoteOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const customerQuery = useQuery({
    queryKey: ['admin', 'customer', customerId],
    queryFn: () => adminApi.customer(customerId),
    staleTime: 30_000,
  });

  const invalidateCustomer = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] }),
    ]);
  };

  const deactivate = useMutation({
    mutationFn: (reason: string) => adminApi.deactivateCustomer(customerId, reason),
    onSuccess: async () => {
      toast.success('Customer account deactivated');
      await invalidateCustomer();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not deactivate customer'),
  });

  if (customerQuery.isLoading) {
    return <CustomerDetailSkeleton />;
  }
  if (customerQuery.isError || !customerQuery.data) {
    return (
      <div className="space-y-5">
        <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="size-3.5" /> Customers</Link>
        <AdminCard><SectionFailure title="Customer workspace unavailable." description="This customer record could not be loaded." onRetry={() => customerQuery.refetch()} /></AdminCard>
      </div>
    );
  }

  const customer = customerQuery.data;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="size-3.5" /> Customers</Link>
        <CustomerActions
          customer={customer}
          onNote={() => setNoteOpen(true)}
          onPlan={() => setPlanOpen(true)}
          onEmail={() => setEmailOpen(true)}
          onDeactivate={() => setDeactivateOpen(true)}
        />
      </div>

      <CustomerProfileHeader customer={customer} />
      <CustomerWorkspace customer={customer} />

      <CustomerNoteSheet open={noteOpen} onOpenChange={setNoteOpen} customer={customer} onSaved={invalidateCustomer} />
      <CustomerPlanSheet open={planOpen} onOpenChange={setPlanOpen} customer={customer} onSaved={invalidateCustomer} />
      <CustomerEmailSheet open={emailOpen} onOpenChange={setEmailOpen} customer={customer} />
      <ImpactDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate customer account?"
        description="This is a high-impact account action and will be recorded in the admin audit trail."
        what={<>{customer.full_name || customer.email} ({customer.email})</>}
        why="Document the operational reason before disabling access."
        impact="The customer can no longer use the RELIASTRA account. Existing organization, billing, and audit data remain authoritative on the server."
        confirmLabel="Deactivate account"
        destructive
        reasonRequired
        onConfirm={(reason) => deactivate.mutateAsync(reason)}
      />
    </div>
  );
}

function CustomerActions({
  customer,
  onNote,
  onPlan,
  onEmail,
  onDeactivate,
}: {
  customer: CustomerDetailResponse;
  onNote: () => void;
  onPlan: () => void;
  onEmail: () => void;
  onDeactivate: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5"><MoreHorizontal className="size-3.5" /> Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onNote}><PencilLine className="size-3.5" /> Edit internal note</DropdownMenuItem>
        <DropdownMenuItem onSelect={onPlan}><CircleDollarSign className="size-3.5" /> Change organization plan</DropdownMenuItem>
        <DropdownMenuItem onSelect={onEmail}><Mail className="size-3.5" /> Email customer</DropdownMenuItem>
        {customer.is_active && <DropdownMenuItem variant="destructive" onSelect={onDeactivate}><ShieldAlert className="size-3.5" /> Deactivate account</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CustomerProfileHeader({ customer }: { customer: CustomerDetailResponse }) {
  const metrics = [
    ['Health', <StatusPill key="health" status={customer.health} />],
    ['MRR', formatAdminCurrency(customer.mrr)],
    ['Plan', customer.plan ? humanize(customer.plan) : '—'],
    ['Customer since', formatAdminDate(customer.created_at)],
  ];
  return (
    <AdminCard className="overflow-visible">
      <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">{(customer.full_name || customer.email).slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Customer workspace</p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white sm:text-3xl">{customer.full_name || customer.email}</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{customer.email}{customer.primary_org?.org_name ? ` · ${customer.primary_org.org_name}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div key={label as string}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
              <div className="mt-2 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </AdminCard>
  );
}

function CustomerWorkspace({ customer }: { customer: CustomerDetailResponse }) {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="max-w-full overflow-x-auto bg-white dark:bg-card">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="product">Product usage</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="support">Support</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-4"><CustomerOverview customer={customer} /></TabsContent>
      <TabsContent value="product" className="mt-4"><CustomerProduct customer={customer} /></TabsContent>
      <TabsContent value="billing" className="mt-4"><CustomerBilling customer={customer} /></TabsContent>
      <TabsContent value="support" className="mt-4"><CustomerSupport customer={customer} /></TabsContent>
      <TabsContent value="activity" className="mt-4"><CustomerActivity customer={customer} /></TabsContent>
    </Tabs>
  );
}

function CustomerOverview({ customer }: { customer: CustomerDetailResponse }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <AdminCard>
        <SectionHeading title="Organizations" subtitle="Membership, plan, and operating context" />
        <div className="border-t border-slate-100 dark:border-white/10">
          {customer.organizations.length === 0 && <AdminEmptyState title="No organizations found." description="This customer has no organization memberships in the current backend snapshot." icon={Building2} />}
          {customer.organizations.map((org) => (
            <div key={org.org_id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 dark:border-white/10 sm:grid-cols-[1.5fr_repeat(3,auto)] sm:items-center sm:px-6">
              <div><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{org.org_name}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{humanize(org.role)} · {formatCompactNumber(org.member_count)} members</p></div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{humanize(org.plan)}</p>
              <p className="text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">{formatAdminCurrency(org.mrr)}</p>
              <StatusPill status={org.billing_status || 'unknown'} />
            </div>
          ))}
        </div>
      </AdminCard>
      <AdminCard>
        <SectionHeading title="Account context" subtitle="Identity and access state" />
        <dl className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10">
          <DetailRow label="Account status" value={<StatusPill status={customer.is_active ? 'active' : 'inactive'} />} />
          <DetailRow label="Email verified" value={customer.is_email_verified ? 'Verified' : 'Not verified'} />
          <DetailRow label="Authentication" value={customer.auth_provider ? humanize(customer.auth_provider) : '—'} />
          <DetailRow label="Last activity" value={customer.last_activity_at ? formatRelativeTime(customer.last_activity_at) : '—'} />
          <DetailRow label="Logins" value={formatCompactNumber(customer.login_count)} />
        </dl>
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Internal note</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{customer.admin_note || 'No internal note yet.'}</p>
        </div>
      </AdminCard>
    </div>
  );
}

function CustomerProduct({ customer }: { customer: CustomerDetailResponse }) {
  const usage: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Dependencies', value: customer.dependencies, icon: Building2 },
    { label: 'Monitors', value: customer.monitors, icon: Wrench },
    { label: 'Incidents', value: customer.incidents, icon: ClipboardList },
    { label: 'Open incidents', value: customer.open_incidents, icon: ShieldAlert },
  ];
  return (
    <AdminCard>
      <SectionHeading title="Product usage" subtitle="The product signals associated with this customer’s organizations" />
      <div className="grid border-t border-slate-100 dark:border-white/10 sm:grid-cols-2 xl:grid-cols-4">
        {usage.map(({ label, value, icon: Icon }, index) => (
          <div key={label} className={cn('p-5', index < usage.length - 1 && 'border-b border-slate-100 sm:border-b-0 sm:border-r dark:border-white/10')}>
            <Icon className="size-4 text-slate-400" />
            <p className="mt-5 text-2xl font-semibold tracking-[-0.04em] tabular-nums text-slate-900 dark:text-white">{formatCompactNumber(value)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

function CustomerBilling({ customer }: { customer: CustomerDetailResponse }) {
  const subscription = customer.subscription || {};
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <AdminCard>
        <SectionHeading title="Subscription" subtitle="Server-authoritative billing snapshot" />
        <dl className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10">
          <DetailRow label="Plan" value={customer.plan ? humanize(customer.plan) : '—'} />
          <DetailRow label="MRR" value={formatAdminCurrency(customer.mrr)} strong />
          <DetailRow label="Billing status" value={<StatusPill status={customer.billing_status || 'unknown'} />} />
          <DetailRow label="Subscription ID" value={typeof subscription.id === 'string' ? subscription.id : '—'} mono />
        </dl>
      </AdminCard>
      <AdminCard>
        <SectionHeading title="Plan history context" subtitle="Current primary organization" />
        {customer.primary_org ? (
          <div className="p-5 sm:p-6">
            <p className="text-lg font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">{customer.primary_org.org_name}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{humanize(customer.primary_org.plan)} plan · {formatCompactNumber(customer.primary_org.member_count)} members · {formatCompactNumber(customer.primary_org.dependency_count)} dependencies.</p>
            <div className="mt-5 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">Plan changes require an explicit reason and backend confirmation. Financial values are refreshed from the server after an update.</div>
          </div>
        ) : <AdminEmptyState title="No billing context available." description="There is no primary organization in this customer snapshot." icon={CircleDollarSign} />}
      </AdminCard>
    </div>
  );
}

function CustomerSupport({ customer }: { customer: CustomerDetailResponse }) {
  return (
    <AdminCard>
      <SectionHeading
        title="Support context"
        subtitle={`${formatCompactNumber(customer.open_support_tickets)} open of ${formatCompactNumber(customer.support_tickets)} recent support tickets`}
        action={<Link href={`/admin/support?search=${encodeURIComponent(customer.email)}`} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300">Open queue <ArrowRight className="size-3" /></Link>}
      />
      <div className="border-t border-slate-100 dark:border-white/10">
        {customer.recent_tickets.length === 0 && <AdminEmptyState title="No support tickets for this customer." description="Support context will appear here when tickets are linked to this account." icon={MessageSquareText} />}
        {customer.recent_tickets.map((ticket) => (
          <Link key={ticket.id} href={`/admin/support/${ticket.id}`} className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.03] sm:px-6">
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{ticket.subject}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{ticket.ticket_number} · {formatAdminDate(ticket.created_at)}</span></span>
            <span className="flex shrink-0 items-center gap-2"><StatusPill status={ticket.priority} /><StatusPill status={ticket.status} /></span>
          </Link>
        ))}
      </div>
    </AdminCard>
  );
}

function CustomerActivity({ customer }: { customer: CustomerDetailResponse }) {
  return (
    <AdminCard>
      <SectionHeading title="Activity" subtitle="Recent account events from the customer workspace snapshot" />
      <div className="border-t border-slate-100 p-5 dark:border-white/10 sm:p-6">
        {customer.recent_activity.length === 0 && <AdminEmptyState title="No recent activity recorded." description="Activity will appear here when events are available for this customer." icon={ClipboardList} />}
        {customer.recent_activity.length > 0 && <div className="relative space-y-0">{customer.recent_activity.map((activity, index) => <ActivityRow key={activity.id || `${activity.action}-${index}`} activity={activity} last={index === customer.recent_activity.length - 1} />)}</div>}
      </div>
    </AdminCard>
  );
}

function ActivityRow({ activity, last }: { activity: CustomerDetailResponse['recent_activity'][number]; last: boolean }) {
  const details = activity.details && Object.keys(activity.details).length > 0 ? Object.entries(activity.details).slice(0, 2).map(([key, value]) => `${humanize(key)}: ${String(value)}`).join(' · ') : null;
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span className="absolute left-[9px] top-5 h-[calc(100%-7px)] w-px bg-slate-200 dark:bg-white/10" />}
      <span className="relative z-10 mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-white/10 dark:bg-card"><span className="size-1.5 rounded-full bg-blue-500" /></span>
      <div className="min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{humanize(activity.action)}</p>{details && <p className="mt-1 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{details}</p>}<p className="mt-1.5 text-[11px] text-slate-400">{formatRelativeTime(activity.created_at)}</p></div>
    </div>
  );
}

function DetailRow({ label, value, strong = false, mono = false }: { label: string; value: React.ReactNode; strong?: boolean; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-5 px-5 py-3.5 sm:px-6"><dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt><dd className={cn('max-w-[60%] truncate text-right text-sm text-slate-800 dark:text-slate-100', strong && 'font-semibold', mono && 'font-mono text-xs')}>{value}</dd></div>;
}

function CustomerNoteSheet({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; customer: CustomerDetailResponse; onSaved: () => Promise<void> }) {
  const [note, setNote] = useState(customer.admin_note || '');
  useEffect(() => { if (open) setNote(customer.admin_note || ''); }, [customer.admin_note, open]);
  const mutation = useMutation({
    mutationFn: () => adminApi.updateCustomer(customer.customer_id, { admin_note: note }),
    onSuccess: async () => { toast.success('Internal note saved'); onOpenChange(false); await onSaved(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save note'),
  });
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Internal customer note</SheetTitle><SheetDescription>Private operational context is saved to the customer record and refreshed from the server.</SheetDescription></SheetHeader><div className="flex-1 space-y-2 px-4"><label htmlFor="customer-note" className="text-xs font-medium text-slate-700 dark:text-slate-200">Note</label><Textarea id="customer-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add useful context for the next administrator…" className="min-h-48 resize-y" /></div><SheetFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save note'}</Button></SheetFooter></SheetContent></Sheet>;
}

function CustomerPlanSheet({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; customer: CustomerDetailResponse; onSaved: () => Promise<void> }) {
  const [plan, setPlan] = useState(customer.plan || '');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => { if (open) { setPlan(customer.plan || ''); setReason(''); } }, [customer.plan, open]);
  const mutation = useMutation({
    mutationFn: () => adminApi.changeCustomerPlan(customer.customer_id, { plan: plan.trim(), reason: reason.trim() || undefined, org_id: customer.primary_org?.org_id }),
    onSuccess: async () => { toast.success('Plan change confirmed by RELIASTRA'); await onSaved(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not change plan'),
  });
  return <><Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Change organization plan</SheetTitle><SheetDescription>The backend accepts the plan value supplied here. Review the impact before submitting a financial change.</SheetDescription></SheetHeader><div className="flex-1 space-y-5 px-4"><div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">Current plan: <strong>{customer.plan ? humanize(customer.plan) : 'No plan'}</strong> · Current MRR: <strong>{formatAdminCurrency(customer.mrr)}</strong></div><div className="space-y-2"><label htmlFor="customer-plan" className="text-xs font-medium text-slate-700 dark:text-slate-200">New plan</label><Input id="customer-plan" value={plan} onChange={(event) => setPlan(event.target.value)} placeholder="Enter the backend plan identifier" /></div><div className="space-y-2"><label htmlFor="plan-reason" className="text-xs font-medium text-slate-700 dark:text-slate-200">Reason</label><Textarea id="plan-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this change needed?" /></div></div><SheetFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!plan.trim()} onClick={() => { onOpenChange(false); setConfirmOpen(true); }}>Review change</Button></SheetFooter></SheetContent></Sheet><ImpactDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Confirm organization plan change?" description="The server is authoritative for billing and MRR; the dashboard will refresh after confirmation." what={<>{customer.primary_org?.org_name || customer.email}: {customer.plan ? humanize(customer.plan) : '—'} → {plan.trim()}</>} why={reason.trim() || 'No additional reason supplied.'} impact="This may change the organization’s product entitlements and recurring revenue. The action is audited." confirmLabel="Confirm plan change" reasonRequired={false} onConfirm={() => mutation.mutateAsync()} /></>;
}

function CustomerEmailSheet({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (open: boolean) => void; customer: CustomerDetailResponse }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { if (!open) { setSubject(''); setBody(''); } }, [open]);
  const mutation = useMutation({
    mutationFn: () => adminApi.emailCustomer(customer.customer_id, { subject, body }),
    onSuccess: () => { toast.success(`Email sent to ${customer.email}`); onOpenChange(false); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not send email'),
  });
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Email customer</SheetTitle><SheetDescription>Compose a focused message to {customer.email}. The backend sends and records the action.</SheetDescription></SheetHeader><div className="flex-1 space-y-4 px-4"><div className="space-y-2"><label htmlFor="customer-email-subject" className="text-xs font-medium">Subject</label><Input id="customer-email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" /></div><div className="space-y-2"><label htmlFor="customer-email-body" className="text-xs font-medium">Message</label><Textarea id="customer-email-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a clear, helpful message…" className="min-h-52" /></div></div><SheetFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!subject.trim() || !body.trim() || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Sending…' : 'Send email'}</Button></SheetFooter></SheetContent></Sheet>;
}

function CustomerDetailSkeleton() {
  return <div className="space-y-6" aria-busy="true"><div className="h-5 w-24 animate-pulse rounded bg-slate-200 dark:bg-white/10" /><div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" /><div className="h-10 w-96 max-w-full animate-pulse rounded bg-slate-200 dark:bg-white/10" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" /><div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" /></div></div>;
}
