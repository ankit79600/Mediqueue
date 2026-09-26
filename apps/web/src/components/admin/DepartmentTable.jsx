import { Badge } from '@/components/ui/badge.jsx';
import { cn } from '@/lib/utils.js';

// MVP_CHECKLIST.md M5: "Heavily loaded department visually highlighted
// (e.g. load per doctor ≥ 8)" — the doc's own example threshold, not invented.
const OVERLOAD_THRESHOLD = 8;

// API_CONTRACT.md §2.9 AdminStats.departments[]. MVP_CHECKLIST.md M5: per-dept
// queue length, avg wait, in consultation, completed, no-shows, active
// doctors, load per doctor, longest wait — rendered as-is, no client-side
// recomputation.
export function DepartmentTable({ departments }) {
  if (!departments || departments.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No department data available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3">Department</th>
            <th className="py-2 pr-3">Queue length</th>
            <th className="py-2 pr-3">Avg wait</th>
            <th className="py-2 pr-3">In consultation</th>
            <th className="py-2 pr-3">Completed</th>
            <th className="py-2 pr-3">No-shows</th>
            <th className="py-2 pr-3">Active doctors</th>
            <th className="py-2 pr-3">Load / doctor</th>
            <th className="py-2 pr-3">Longest wait</th>
          </tr>
        </thead>
        <tbody>
          {departments.map((dept) => {
            const overloaded = dept.loadPerDoctor >= OVERLOAD_THRESHOLD;
            return (
              <tr
                key={dept.departmentId}
                className={cn('border-b border-slate-100', overloaded && 'bg-red-50')}
              >
                <td className="py-2 pr-3 font-medium text-slate-900">
                  {dept.name} <span className="text-slate-400">({dept.code})</span>
                </td>
                <td className="py-2 pr-3">{dept.queueLength}</td>
                <td className="py-2 pr-3">{dept.avgWaitMin} min</td>
                <td className="py-2 pr-3">{dept.inConsultation}</td>
                <td className="py-2 pr-3">{dept.completedToday}</td>
                <td className="py-2 pr-3">{dept.noShowToday}</td>
                <td className="py-2 pr-3">{dept.activeDoctors}</td>
                <td className="py-2 pr-3">
                  <span className={cn(overloaded && 'font-semibold text-red-700')}>{dept.loadPerDoctor}</span>
                  {overloaded && (
                    <Badge variant="danger" className="ml-2">
                      Overloaded
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-3">{dept.longestWaitMin} min</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
