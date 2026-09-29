import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, Ticket, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

function formatWait(min) {
  if (min == null) return '—';
  if (min < 1) return '< 1 min';
  return `~${Math.round(min)} min`;
}

const PRIORITIES = [
  { value: 'NONE', label: 'Standard' },
  { value: 'ELDERLY', label: 'Elderly (60+)' },
  { value: 'PREGNANT', label: 'Pregnant' },
];

export default function Book() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [step, setStep] = useState(1); // 1 = pick dept, 2 = pick doctor+priority
  const [selectedDept, setSelectedDept] = useState(null);
  const [doctorId, setDoctorId] = useState('');
  const [priority, setPriority] = useState('NONE');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/departments')
      .then((data) => setDepartments(data.departments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleBook() {
    setSubmitting(true);
    setError(null);
    try {
      const data = await api.post('/tokens', {
        departmentId: selectedDept.id,
        doctorId: doctorId || null,
        type: 'LIVE',
        slotId: null,
        priority,
      });
      navigate(`/patient/tokens/${data.token.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PROFILE_INCOMPLETE') navigate('/patient/profile', { replace: true });
        else if (err.code === 'ACTIVE_TOKEN_EXISTS') {
          const tokenId = err.details?.tokenId;
          navigate(tokenId ? `/patient/tokens/${tokenId}` : '/patient/tokens', { replace: true });
        } else setError(err.message);
      } else {
        setError('Could not book token. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#5b6b82]">
        <Loader2 className="size-6 animate-spin" />
        <p className="mt-2 text-sm">Loading departments…</p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#0f172a]">Select Department</h1>
          <p className="mt-0.5 text-sm text-[#5b6b82]">Which department do you need today?</p>
        </div>
        <div className="flex flex-col gap-3">
          {departments.map((dept) => {
            const activeDocs = dept.doctors?.filter((d) => d.isActive).length ?? 0;
            return (
              <button
                key={dept.id}
                onClick={() => { setSelectedDept(dept); setStep(2); }}
                disabled={activeDocs === 0}
                className="flex items-center justify-between rounded-2xl border border-[#e2e8f0] bg-white p-4 text-left shadow-sm transition-all hover:border-[#0284c7]/40 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div>
                  <p className="font-semibold text-[#0f172a]">{dept.name}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[#5b6b82]">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" aria-hidden="true" />
                      {dept.queueLength ?? 0} waiting
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" aria-hidden="true" />
                      {formatWait(dept.estimatedWaitMin)}
                    </span>
                  </div>
                  {activeDocs === 0 && <p className="mt-1 text-xs text-amber-600">No active doctors</p>}
                </div>
                <ChevronRight className="size-5 text-[#5b6b82]" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const activeDoctors = selectedDept.doctors?.filter((d) => d.isActive) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setStep(1)}
          className="flex size-9 items-center justify-center rounded-xl bg-white border border-[#e2e8f0] text-[#5b6b82] hover:text-[#0f172a] transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[#0f172a]">{selectedDept.name}</h1>
          <p className="text-sm text-[#5b6b82]">Choose your preferences</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 pt-5">
          {activeDoctors.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-[#0f172a]">Doctor <span className="font-normal text-[#5b6b82]">(optional)</span></p>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[#e2e8f0] px-4 py-3 hover:bg-[#f4f7fb] transition-colors has-[:checked]:border-[#0284c7] has-[:checked]:bg-[#e0f2fe]/40">
                  <input
                    type="radio"
                    name="doctor"
                    value=""
                    checked={doctorId === ''}
                    onChange={() => setDoctorId('')}
                    className="accent-[#0284c7]"
                  />
                  <span className="text-sm font-medium text-[#0f172a]">Auto-assign</span>
                </label>
                {activeDoctors.map((doc) => (
                  <label
                    key={doc.id}
                    className="flex items-center gap-3 cursor-pointer rounded-xl border border-[#e2e8f0] px-4 py-3 hover:bg-[#f4f7fb] transition-colors has-[:checked]:border-[#0284c7] has-[:checked]:bg-[#e0f2fe]/40"
                  >
                    <input
                      type="radio"
                      name="doctor"
                      value={doc.id}
                      checked={doctorId === doc.id}
                      onChange={() => setDoctorId(doc.id)}
                      className="accent-[#0284c7]"
                    />
                    <div>
                      <p className="text-sm font-medium text-[#0f172a]">{doc.name}</p>
                      <p className="text-xs text-[#5b6b82]">{doc.room}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-[#0f172a]">Priority</p>
            <div className="flex flex-col gap-1.5">
              {PRIORITIES.map(({ value, label }) => (
                <label
                  key={value}
                  className="flex items-center gap-3 cursor-pointer rounded-xl border border-[#e2e8f0] px-4 py-3 hover:bg-[#f4f7fb] transition-colors has-[:checked]:border-[#0284c7] has-[:checked]:bg-[#e0f2fe]/40"
                >
                  <input
                    type="radio"
                    name="priority"
                    value={value}
                    checked={priority === value}
                    onChange={() => setPriority(value)}
                    className="accent-[#0284c7]"
                  />
                  <span className="text-sm font-medium text-[#0f172a]">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          <Button size="lg" className="h-11 w-full text-base" disabled={submitting} onClick={handleBook}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Booking…' : 'Confirm & Get Token'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
