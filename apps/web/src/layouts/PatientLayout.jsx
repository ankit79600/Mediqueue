import { Outlet } from 'react-router-dom';

// Mobile shell (360px target, FINAL_PROJECT_STRUCTURE.md §3) for /patient/* pages.
// Owned by Member B (patient frontend) — kept as a minimal shell here only so
// the route tree renders; full patient UI is out of scope for this phase.
export function PatientLayout() {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white">
      <Outlet />
    </div>
  );
}
