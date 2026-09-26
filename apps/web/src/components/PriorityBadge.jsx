import { Badge } from '@/components/ui/badge.jsx';

// DATABASE_SCHEMA.md §2 enum `priority`.
const PRIORITY_VARIANT = {
  NONE: 'default',
  ELDERLY: 'info',
  PREGNANT: 'info',
  EMERGENCY: 'danger',
};

export function PriorityBadge({ priority }) {
  if (priority === 'NONE') return null;
  return <Badge variant={PRIORITY_VARIANT[priority] ?? 'default'}>{priority}</Badge>;
}
