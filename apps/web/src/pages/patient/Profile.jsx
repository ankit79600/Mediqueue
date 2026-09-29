import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRound, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';

export default function Profile() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', age: '', gender: '' });
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/patients/me').then((data) => {
      if (data.name) setForm({ name: data.name ?? '', age: data.age?.toString() ?? '', gender: data.gender ?? '' });
      if (data.consent) setConsent(true);
    }).catch(() => {});
  }, []);

  const canSubmit = form.name.trim().length >= 2 &&
    Number(form.age) >= 0 && Number(form.age) <= 120 && form.age !== '' &&
    consent;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
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
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not save profile. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#0284c7]">
              <UserRound className="size-5" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-[#0f172a]">Complete your profile</h1>
            <p className="text-sm text-[#5b6b82]">We need a few details before booking your token.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              placeholder="e.g. Rahul Sharma"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              disabled={loading}
              className="h-11"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                placeholder="e.g. 35"
                value={form.age}
                onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                disabled={loading}
                className="h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gender">Gender <span className="font-normal text-[#5b6b82]">(opt.)</span></Label>
              <select
                id="gender"
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                disabled={loading}
                className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none focus:border-[#0284c7] focus:ring-2 focus:ring-[#0284c7]/20 disabled:opacity-50"
              >
                <option value="">Select…</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={loading}
              className="mt-0.5 size-4 rounded accent-[#0284c7]"
            />
            <span className="text-sm text-[#5b6b82]">
              I consent to MediQueue processing my health data for queue management.
            </span>
          </label>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={!canSubmit || loading}>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Saving…' : 'Save & Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
