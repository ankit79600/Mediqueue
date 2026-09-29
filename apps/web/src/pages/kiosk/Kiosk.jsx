import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';

const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY ?? '';
const PRIORITIES = [
  { value: 'NONE', label: 'None' },
  { value: 'ELDERLY', label: 'Elderly (60+)' },
  { value: 'PREGNANT', label: 'Pregnant' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

function kioskPost(body) {
  return api.post('/kiosk/tokens', body, { headers: { 'X-Kiosk-Key': KIOSK_KEY } });
}

function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_KIOSK_KEY') return 'Kiosk key is invalid. Contact admin.';
    if (err.code === 'NO_ACTIVE_DOCTOR') return 'No doctors are active in this department right now.';
    if (err.code === 'ACTIVE_TOKEN_EXISTS') return 'This patient already has an active token in this department today.';
    if (err.code === 'VALIDATION_ERROR') {
      const fields = err.details?.fields ?? {};
      if (fields.name) return `Name: ${fields.name}`;
      if (fields.phone) return `Phone: ${fields.phone}`;
      if (fields.age) return `Age: ${fields.age}`;
      return 'Check the details and try again.';
    }
    return err.message;
  }
  return 'Could not issue token. Try again.';
}

const BLANK = { name: '', phone: '', age: '', departmentId: '', doctorId: '', priority: 'NONE' };

export default function Kiosk() {
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [status, setStatus] = useState('idle'); // idle | pending | error | done
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { token, print }

  useEffect(() => {
    api.get('/departments').then((data) => setDepartments(data.departments ?? [])).catch(() => {});
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === 'departmentId') setForm((f) => ({ ...f, departmentId: value, doctorId: '' }));
  }

  const selectedDept = departments.find((d) => d.id === form.departmentId);
  const activeDoctors = selectedDept?.doctors.filter((d) => d.isActive) ?? [];

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('pending');
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        departmentId: form.departmentId,
        doctorId: form.doctorId || null,
        priority: form.priority,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.age !== '' ? { age: Number(form.age) } : {}),
      };
      const data = await kioskPost(body);
      setResult(data);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(errorMessage(err));
    }
  }

  function handleReset() {
    setForm(BLANK);
    setResult(null);
    setStatus('idle');
    setError(null);
  }

  if (status === 'done' && result) {
    const { print } = result;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Token Issued</p>
            <p className="mt-2 text-6xl font-bold text-slate-900">{print.tokenNo}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-slate-500">Department</p>
                <p className="font-medium">{print.departmentName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Doctor</p>
                <p className="font-medium">{print.doctorName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Room</p>
                <p className="font-medium">{print.room}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Position</p>
                <p className="font-medium">{print.position}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500">Estimated wait</p>
                <p className="text-lg font-bold text-slate-900">
                  {print.estimatedWaitMin != null ? `~${print.estimatedWaitMin} min` : '—'}
                </p>
              </div>
            </div>

            {print.trackUrl && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
                <p className="text-xs text-slate-500">Track at:</p>
                <p className="mt-0.5 break-all text-xs font-mono text-slate-700">{print.trackUrl}</p>
              </div>
            )}

            <Button onClick={handleReset} className="mt-2 w-full">
              Issue Another Token
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-lg">Walk-in Token</CardTitle>
          <p className="mt-1 text-center text-sm text-slate-500">Kiosk — Staff use only</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Patient name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ramesh Kumar"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                disabled={status === 'pending'}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">
                  Phone <span className="font-normal text-slate-400">(opt.)</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="9876543210"
                  maxLength={10}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  disabled={status === 'pending'}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="age">
                  Age <span className="font-normal text-slate-400">(opt.)</span>
                </Label>
                <Input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  placeholder="67"
                  value={form.age}
                  onChange={(e) => set('age', e.target.value)}
                  disabled={status === 'pending'}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dept">Department</Label>
              <select
                id="dept"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                value={form.departmentId}
                onChange={(e) => {
                  setForm((f) => ({ ...f, departmentId: e.target.value, doctorId: '' }));
                }}
                disabled={status === 'pending'}
                required
              >
                <option value="">Select…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {activeDoctors.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doctor">
                  Doctor <span className="font-normal text-slate-400">(opt. — auto-assign if blank)</span>
                </Label>
                <select
                  id="doctor"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                  value={form.doctorId}
                  onChange={(e) => set('doctorId', e.target.value)}
                  disabled={status === 'pending'}
                >
                  <option value="">Auto-assign</option>
                  {activeDoctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.room})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
                disabled={status === 'pending'}
              >
                {PRIORITIES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              type="submit"
              disabled={status === 'pending' || !form.name.trim() || !form.departmentId}
            >
              {status === 'pending' ? 'Issuing…' : 'Issue Token'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
