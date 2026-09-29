import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';

function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_PHONE' || err.code === 'VALIDATION_ERROR')
      return 'Enter a valid 10-digit mobile number (starting 6–9).';
    if (err.code === 'OTP_RATE_LIMITED')
      return 'Too many OTP requests. Wait 30 seconds and try again.';
    return err.message;
  }
  return 'Could not send OTP. Check your connection and try again.';
}

export default function PatientLogin() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('idle'); // idle | pending | error
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('pending');
    setError(null);
    try {
      const data = await api.post('/auth/otp/request', { phone });
      navigate('/patient/otp', {
        state: { phone, devOtp: data.devOtp, resendAfterSec: data.resendAfterSec ?? 30 },
      });
    } catch (err) {
      setStatus('error');
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-lg">Patient Login</CardTitle>
          <p className="mt-1 text-center text-sm text-slate-500">
            Enter your mobile number to receive an OTP
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="9876543210"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                disabled={status === 'pending'}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={status === 'pending' || phone.length < 10}>
              {status === 'pending' ? 'Sending OTP…' : 'Send OTP'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
