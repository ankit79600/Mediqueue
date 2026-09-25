import { Routes, Route } from 'react-router-dom';
import { PatientLayout } from '@/layouts/PatientLayout.jsx';
import { OpsLayout } from '@/layouts/OpsLayout.jsx';
import { RequireRole } from '@/components/RequireRole.jsx';
import { Placeholder } from '@/components/Placeholder.jsx';

import Landing from '@/pages/Landing.jsx';
import PatientLogin from '@/pages/patient/Login.jsx';
import PatientOtp from '@/pages/patient/Otp.jsx';
import PatientProfile from '@/pages/patient/Profile.jsx';
import PatientBook from '@/pages/patient/Book.jsx';
import PatientTokenLive from '@/pages/patient/TokenLive.jsx';
import PatientMyTokens from '@/pages/patient/MyTokens.jsx';
import PublicTrack from '@/pages/track/PublicTrack.jsx';
import StaffLogin from '@/pages/staff/StaffLogin.jsx';
import StaffPanel from '@/pages/staff/StaffPanel.jsx';
import AdminDashboard from '@/pages/admin/AdminDashboard.jsx';
import SmsLog from '@/pages/admin/SmsLog.jsx';
import Kiosk from '@/pages/kiosk/Kiosk.jsx';
import DisplayBoard from '@/pages/display/DisplayBoard.jsx';

// Route table per FINAL_PROJECT_STRUCTURE.md §3. Every page below is a
// Placeholder stub for this phase — see docs/... report for what's deferred.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route element={<PatientLayout />}>
        <Route path="/patient/login" element={<PatientLogin />} />
        <Route path="/patient/otp" element={<PatientOtp />} />
        <Route
          path="/patient/profile"
          element={
            <RequireRole role="PATIENT" redirectTo="/patient/login">
              <PatientProfile />
            </RequireRole>
          }
        />
        <Route
          path="/patient/book"
          element={
            <RequireRole role="PATIENT" redirectTo="/patient/login">
              <PatientBook />
            </RequireRole>
          }
        />
        <Route
          path="/patient/tokens"
          element={
            <RequireRole role="PATIENT" redirectTo="/patient/login">
              <PatientMyTokens />
            </RequireRole>
          }
        />
        <Route
          path="/patient/tokens/:tokenId"
          element={
            <RequireRole role="PATIENT" redirectTo="/patient/login">
              <PatientTokenLive />
            </RequireRole>
          }
        />
        <Route path="/t/:tokenId" element={<PublicTrack />} />
      </Route>

      <Route element={<OpsLayout />}>
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route
          path="/staff/doctors/:doctorId"
          element={
            <RequireRole role={['STAFF', 'ADMIN']} redirectTo="/staff/login">
              <StaffPanel />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole role="ADMIN" redirectTo="/staff/login">
              <AdminDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/admin/sms"
          element={
            <RequireRole role="ADMIN" redirectTo="/staff/login">
              <SmsLog />
            </RequireRole>
          }
        />
      </Route>

      {/* Kiosk uses X-Kiosk-Key, not a patient/staff JWT — no RequireRole guard. */}
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/display/:deptId" element={<DisplayBoard />} />

      <Route path="*" element={<Placeholder title="Not found" />} />
    </Routes>
  );
}
