import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api.js';
import { setToken } from '@/lib/auth.js';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function Otp() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { phone, devOtp, resendAfterSec = 30 } = state ?? {};

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(resendAfterSec);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!phone) navigate('/patient/login', { replace: true });
  }, [phone, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  function handleChange(i, val) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();
    if (next.every(Boolean)) submitOtp(next.join(''));
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  async function submitOtp(code) {
    setLoading(true);
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
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_OTP') setError('Incorrect code. Please try again.');
        else if (err.code === 'OTP_EXPIRED') setError('Code expired. Request a new one.');
        else setError(err.message);
      } else {
        setError('Verification failed. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    try {
      await api.post('/auth/otp/request', { phone });
      setCountdown(resendAfterSec);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setError(null);
    } catch {
      setError('Could not resend. Try again.');
    }
  }

  if (!phone) return null;

  const otpValue = otp.join('');

  return (
    <Card className="mt-4">
      <CardContent className="pt-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-[#0f172a]">Enter verification code</h1>
            <p className="text-sm text-[#5b6b82]">
              Code sent to <span className="font-medium text-[#0f172a]">+91 {phone.replace(/(\d{5})(\d{5})/, '$1 $2')}</span>
            </p>
          </div>

          {devOtp && (
            <div className="rounded-xl bg-[#e0f2fe] px-4 py-3">
              <p className="text-xs font-medium text-[#075985]">Demo mode — your OTP is</p>
              <p className="mt-0.5 text-2xl font-bold tracking-widest text-[#0284c7]">{devOtp}</p>
            </div>
          )}

          {/* OTP boxes */}
          <div className="flex justify-center gap-2" role="group" aria-label="6-digit OTP">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={loading}
                className="size-12 rounded-xl border border-[#cbd5e1] bg-white text-center text-xl font-semibold text-[#0f172a] outline-none transition-all focus:border-[#0284c7] focus:ring-2 focus:ring-[#0284c7]/20 disabled:opacity-50"
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          <Button
            size="lg"
            className="h-11 w-full text-base"
            disabled={otpValue.length !== 6 || loading}
            onClick={() => submitOtp(otpValue)}
          >
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Verifying…' : 'Verify & Continue'}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <Link
              to="/patient/login"
              className="inline-flex items-center gap-1 text-[#5b6b82] hover:text-[#0f172a]"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Change number
            </Link>
            {countdown > 0 ? (
              <span className="text-[#5b6b82]">Resend in {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="inline-flex items-center gap-1 font-medium text-[#0284c7] hover:underline"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                Resend code
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
