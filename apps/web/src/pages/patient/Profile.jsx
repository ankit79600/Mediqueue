import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';

const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR') {
      const fields = err.details?.fields ?? {};
      if (fields.name) return `Name: ${fields.name}`;
      if (fields.age) return `Age: ${fields.age}`;
      return 'Check your details and try again.';
    }
    if (err.code === 'CONSENT_REQUIRED') return 'You must give consent to continue.';
    return err.message;
  }
  return 'Could not save profile. Try again.';
}

export default function PatientProfile() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', age: '', gender: '', consent: false });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | pending | error
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/patients/me')
      .then((patient) => {
        setForm({
          name: patient.name ?? '',
          age: patient.age != null ? String(patient.age) : '',
          gender: patient.gender ?? '',
          consent: !!patient.consentAt,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('pending');
    setError(null);
    try {
      await api.put('/patients/me', {
        name: form.name.trim(),
        age: Number(form.age),
        ...(form.gender ? { gender: form.gender } : {}),
        consent: true,
      });
      navigate('/patient/tokens', { replace: true });
    } catch (err) {
      setStatus('error');
      setError(errorMessage(err));
    }
  }

  const canSubmit =
    status !== 'pending' &&
    form.name.trim().length >= 2 &&
    form.age !== '' &&
    Number(form.age) >= 0 &&
    Number(form.age) <= 120 &&
    form.consent;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-lg">Complete Your Profile</CardTitle>
          <p className="mt-1 text-center text-sm text-slate-500">
            Required before booking a token
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Riya Das"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                disabled={status === 'pending'}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                placeholder="34"
                value={form.age}
                onChange={(e) => set('age', e.target.value)}
                disabled={status === 'pending'}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gender">
                Gender <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <select
                id="gender"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
                disabled={status === 'pending'}
              >
                <option value="">Select…</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g.charAt(0) + g.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                checked={form.consent}
                onChange={(e) => set('consent', e.target.checked)}
                disabled={status === 'pending'}
              />
              <span className="text-slate-700">
                I consent to MediQueue storing and using my data for queue management.
              </span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={!canSubmit}>
              {status === 'pending' ? 'Saving…' : 'Save & Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
