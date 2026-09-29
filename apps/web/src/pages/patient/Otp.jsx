import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.js';
import { setToken } from '@/lib/auth.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';

function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'OTP_INVALID') {
      const left = err.details?.attemptsLeft;
      return left != null
        ? `Wrong OTP. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Wrong OTP.';
    }
    if (err.code === 'OTP_EXPIRED') return 'OTP has expired. Request a new one.';
    if (err.code === 'OTP_TOO_MANY_ATTEMPTS') return 'Too many wrong attempts. Request a new OTP.';
    if (err.code === 'VALIDATION_ERROR') return 'Enter the 6-digit OTP.';
    return err.message;
  }
  return 'Could not verify OTP. Try again.';
}

export default function PatientOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { phone, devOtp: initialDevOtp, resendAfterSec = 30 } = location.state ?? {};

  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState(initialDevOtp);
  const [status, setStatus] = useState('idle'); // idle | pending | error
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(resendAfterSec);
  const [resending, setResending] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!phone) {
      navigate('/patient/login', { replace: true });
      return;
    }
    startCountdown(resendAfterSec);
    return () => clearInterval(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startCountdown(from) {
    clearInterval(timerRef.current);
    setCountdown(from);
    timerRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearInterval(timerRef.current); return 0; }
        return n - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('pending');
    setError(null);
    try {
      const data = await api.post('/auth/otp/verify', { phone, code });
      setToken(data.accessToken);
      if (data.isNewPatient || !data.patient?.profileComplete) {
        navigate('/patient/profile', { replace: true });
      } else {
        navigate('/patient/tokens', { replace: true });
      }
    } catch (err) {
      setStatus('error');
      setError(errorMessage(err));
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const data = await api.post('/auth/otp/request', { phone });
      setDevOtp(data.devOtp ?? null);
      startCountdown(data.resendAfterSec ?? 30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  const maskedPhone = phone?.replace(/^(\d{2})\d{6}(\d{2})$/, '$1XXXXXX$2');

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-lg">Enter OTP</CardTitle>
          <p className="mt-1 text-center text-sm text-slate-500">
            Sent to {maskedPhone}
          </p>
        </CardHeader>
        <CardContent>
          {devOtp && (
            <div className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              SMS simulated — your OTP is <strong>{devOtp}</strong>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp">6-digit OTP</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                placeholder="——————"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={status === 'pending'}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={status === 'pending' || code.length < 6}>
              {status === 'pending' ? 'Verifying…' : 'Verify OTP'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={countdown > 0 || resending}
              onClick={handleResend}
            >
              {resending
                ? 'Sending…'
                : countdown > 0
                  ? `Resend OTP in ${countdown}s`
                  : 'Resend OTP'}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => navigate('/patient/login')}
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600"
          >
            Wrong number? Go back
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
