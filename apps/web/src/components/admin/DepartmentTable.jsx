import { Badge } from '@/components/ui/badge.jsx';
import { cn } from '@/lib/utils.js';

const OVERLOAD_THRESHOLD = 8;

export function DepartmentTable({ departments }) {
  if (!departments || departments.length === 0) {
    return <p className="p-4 text-sm text-[#5b6b82]">No department data available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#e2e8f0] text-xs uppercase tracking-wide text-[#5b6b82]">
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
                className={cn('border-b border-[#e2e8f0]/60', overloaded && 'bg-red-50')}
              >
                <td className="py-2 pr-3 font-medium text-[#0f172a]">
                  {dept.name} <span className="text-[#5b6b82]">({dept.code})</span>
                </td>
                <td className="py-2 pr-3 text-[#0f172a]">{dept.queueLength}</td>
                <td className="py-2 pr-3 text-[#5b6b82]">{dept.avgWaitMin} min</td>
                <td className="py-2 pr-3 text-[#0f172a]">{dept.inConsultation}</td>
                <td className="py-2 pr-3 text-[#0f172a]">{dept.completedToday}</td>
                <td className="py-2 pr-3 text-[#0f172a]">{dept.noShowToday}</td>
                <td className="py-2 pr-3 text-[#0f172a]">{dept.activeDoctors}</td>
                <td className="py-2 pr-3">
                  <span className={cn('text-[#0f172a]', overloaded && 'font-semibold text-red-700')}>{dept.loadPerDoctor}</span>
                  {overloaded && (
                    <Badge variant="danger" className="ml-2">
                      Overloaded
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-3 text-[#5b6b82]">{dept.longestWaitMin} min</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
