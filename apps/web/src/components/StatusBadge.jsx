import { Badge } from '@/components/ui/badge.jsx';

// DATABASE_SCHEMA.md §2 enum `token_status`.
const STATUS_VARIANT = {
  WAITING: 'default',
  CALLED: 'info',
  COMPLETED: 'success',
  NO_SHOW: 'danger',
  CANCELLED: 'warning',
};

export function StatusBadge({ status }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{status}</Badge>;
}
