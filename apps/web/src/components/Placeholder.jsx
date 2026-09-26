// Generic stub used by not-yet-built pages so the route tree resolves.
// FINAL_PROJECT_STRUCTURE.md §3 route table — replace with the real page per phase.
export function Placeholder({ title }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-1 p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500">Coming soon.</p>
    </div>
  );
}
