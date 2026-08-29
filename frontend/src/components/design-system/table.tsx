import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function RsTableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rs-table-wrap', className)}>{children}</div>;
}

export function RsTable({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn('rs-table', className)}>{children}</table>;
}

export function RsTableHeader({ children }: { children: ReactNode }) {
  return <thead className="rs-table-header">{children}</thead>;
}

export function RsTableRow({
  children,
  clickable,
  className,
  onClick,
}: {
  children: ReactNode;
  clickable?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={cn('rs-table-row', className)}
      data-clickable={clickable ? 'true' : undefined}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}
