import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// MVP_CHECKLIST.md M5 "Chart 1: bar — queue length (patient load) per department".
// Reads AdminStats.departments[] as-is — no derived/computed values.
export function DepartmentLoadChart({ departments }) {
  if (!departments || departments.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No department data available.</p>;
  }

  const data = departments.map((d) => ({ code: d.code, queueLength: d.queueLength }));

  return (
    <div className="h-64 w-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="code" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="queueLength" name="Queue length" fill="#1e293b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
