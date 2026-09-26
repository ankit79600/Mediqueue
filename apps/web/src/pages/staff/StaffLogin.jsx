import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.js';
import { setToken } from '@/lib/auth.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';
import { staffLoginResponse, adminLoginResponse, departments } from '@/mocks/fixtures.js';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

// API_CONTRACT.md E4 `POST /auth/staff/login`. Mocked path only stands in for
// the real endpoint when VITE_USE_MOCKS=true — same response shape either way.
async function loginStaff({ username, password }) {
  if (USE_MOCKS) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (username === 'admin' && password === 'admin123') return adminLoginResponse;
    if (username.startsWith('dr.') && password === 'demo123') return staffLoginResponse;
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }
  return api.post('/auth/staff/login', { username, password });
}

// API_CONTRACT.md E7 `GET /departments` — used only to build the ADMIN
// "pick a doctor" list (no dedicated picker route exists in FINAL_PROJECT_STRUCTURE.md §3).
async function loadDepartments() {
  if (USE_MOCKS) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { departments, serviceDate: new Date().toISOString().slice(0, 10) };
  }
  return api.get('/departments');
}

function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_CREDENTIALS') return 'Incorrect username or password.';
    if (err.code === 'VALIDATION_ERROR') return 'Enter both username and password.';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

export default function StaffLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [status, setStatus] = useState('idle'); // idle | pending | error
  const [error, setError] = useState(null);
  const [doctorChoices, setDoctorChoices] = useState(null); // set only for ADMIN

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('pending');
    setError(null);
    try {
      const { accessToken, staff } = await loginStaff(form);
      setToken(accessToken);

      if (staff.role === 'ADMIN') {
        const { departments: depts } = await loadDepartments();
        setDoctorChoices(depts.flatMap((d) => d.doctors.map((doc) => ({ ...doc, deptName: d.name }))));
        setStatus('idle');
        return;
      }

      navigate(`/staff/doctors/${staff.doctorId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setStatus('error');
    }
  }

  if (doctorChoices) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Choose a doctor's queue</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {doctorChoices.length === 0 && <p className="text-sm text-slate-500">No doctors found.</p>}
            {doctorChoices.map((doc) => (
              <Button
                key={doc.id}
                variant="outline"
                className="justify-between"
                onClick={() => navigate(`/staff/doctors/${doc.id}`)}
              >
                <span>{doc.name}</span>
                <span className="text-slate-500">{doc.deptName} · {doc.room}</span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>Staff / Admin login</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                disabled={status === 'pending'}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                disabled={status === 'pending'}
                required
              />
            </div>
            {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={status === 'pending'}>
              {status === 'pending' ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
