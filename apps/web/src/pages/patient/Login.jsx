import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Label } from '@/components/ui/label.jsx';

export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const phoneValid = /^[6-9]\d{9}$/.test(phone);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phoneValid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/auth/otp/request', { phone });
      navigate('/patient/otp', {
        state: { phone, devOtp: data.devOtp, resendAfterSec: data.resendAfterSec ?? 30 },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'OTP_RATE_LIMITED') setError('Too many requests. Please wait before trying again.');
        else if (err.code === 'INVALID_PHONE') setError('Enter a valid 10-digit Indian mobile number.');
        else setError(err.message);
      } else {
        setError('Could not send OTP. Check your connection.');
      }
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
              <Smartphone className="size-5" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-[#0f172a]">Sign in with your phone</h1>
            <p className="text-sm text-[#5b6b82]">We'll send a 6-digit code to verify your number.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Mobile number</Label>
            <div className="flex h-11 items-center overflow-hidden rounded-xl border border-[#cbd5e1] focus-within:border-[#0284c7] focus-within:ring-2 focus-within:ring-[#0284c7]/20 transition-all">
              <span className="flex h-full items-center border-r border-[#e2e8f0] bg-[#eef2f7] px-3 text-sm font-medium text-[#5b6b82]">
                +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                disabled={loading}
                className="h-full flex-1 bg-transparent px-3 text-base tracking-wide outline-none disabled:opacity-50"
                aria-invalid={phone.length === 10 && !phoneValid}
              />
            </div>
            {phone.length === 10 && !phoneValid && (
              <p className="text-xs text-red-600">Must start with 6–9 and be 10 digits.</p>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full text-base"
            disabled={!phoneValid || loading}
          >
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Sending…' : 'Send OTP'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
