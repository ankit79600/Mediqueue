import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// MVP_CHECKLIST.md M5 "Chart 2: line/bar — arrivals vs completed per hour".
// Reads AdminStats.hourly[] as-is — no derived/computed values.
export function HourlyChart({ hourly }) {
  if (!hourly || hourly.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No hourly data available yet.</p>;
  }

  return (
    <div className="h-64 w-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={hourly}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="arrivals" name="Arrivals" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
