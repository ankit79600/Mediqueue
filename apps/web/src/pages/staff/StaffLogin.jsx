import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, Lock, Loader2, LayoutDashboard } from 'lucide-react';
import { api, ApiError } from '@/lib/api.js';
import { setToken } from '@/lib/auth.js';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';
import { staffLoginResponse, adminLoginResponse, departments } from '@/mocks/fixtures.js';
import SoftAurora from '@/components/SoftAurora.jsx';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

async function loginStaff({ username, password }) {
  if (USE_MOCKS) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (username === 'admin' && password === 'admin123') return adminLoginResponse;
    if (username.startsWith('dr.') && password === 'demo123') return staffLoginResponse;
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }
  return api.post('/auth/staff/login', { username, password });
}

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
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [doctorChoices, setDoctorChoices] = useState(null);

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
      <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-[#0f172a]">Welcome, Admin</h1>
          <p className="text-sm text-[#5b6b82]">Choose where to go</p>
        </div>

        <Button size="lg" className="h-11 w-full gap-2 text-base" onClick={() => navigate('/admin')}>
          <LayoutDashboard className="size-4" aria-hidden="true" />
          Open admin dashboard
        </Button>

        {doctorChoices.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-2 pt-5">
              <p className="text-sm font-medium text-[#0f172a]">Or open a doctor's queue directly</p>
              <div className="flex flex-col gap-1.5">
                {doctorChoices.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => navigate(`/staff/doctors/${doc.id}`)}
                    className="flex items-center justify-between rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-left hover:border-[#0284c7]/40 hover:bg-[#e0f2fe]/30 transition-all"
                  >
                    <span className="text-sm font-medium text-[#0f172a]">{doc.name}</span>
                    <span className="text-xs text-[#5b6b82]">{doc.deptName} · {doc.room}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="relative -mx-4 -mt-5 min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <SoftAurora speed={0.15} brightness={0.45} color1="#dbeafe" color2="#a5f3fc" />
      </div>
      <div className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Card className="shadow-xl">
            <CardContent className="pt-5">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#0284c7]">
                    <Stethoscope className="size-5" aria-hidden="true" />
                  </div>
                  <h1 className="text-lg font-semibold text-[#0f172a]">Staff / Admin Login</h1>
                  <p className="text-sm text-[#5b6b82]">Sign in to access the OPD dashboard</p>
                </div>

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
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5b6b82]" aria-hidden="true" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        className="pl-9"
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        disabled={status === 'pending'}
                        required
                      />
                    </div>
                  </div>

                  {status === 'error' && (
                    <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
                  )}

                  <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={status === 'pending'}>
                    {status === 'pending' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {status === 'pending' ? 'Signing in…' : 'Sign in'}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
