import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

const PRIORITIES = [
  { value: 'NONE', label: 'None' },
  { value: 'ELDERLY', label: 'Elderly (60+)' },
  { value: 'PREGNANT', label: 'Pregnant' },
];

function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'NO_ACTIVE_DOCTOR') return 'No doctors are active in this department right now.';
    if (err.code === 'DOCTOR_INACTIVE') return 'The selected doctor is not currently active.';
    if (err.code === 'SLOT_FULL') return 'This slot is full. Please choose another.';
    return err.message;
  }
  return 'Could not book token. Try again.';
}

export default function Book() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('dept'); // dept | options
  const [selected, setSelected] = useState({ dept: null, doctor: null, priority: 'NONE' });
  const [status, setStatus] = useState('idle'); // idle | pending | error
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/departments')
      .then((data) => setDepartments(data.departments ?? []))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          navigate('/patient/login', { replace: true });
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  async function handleBook() {
    setStatus('pending');
    setError(null);
    try {
      const token = await api.post('/tokens', {
        departmentId: selected.dept.id,
        doctorId: selected.doctor?.id ?? null,
        type: 'LIVE',
        slotId: null,
        priority: selected.priority,
      });
      navigate(`/patient/tokens/${token.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PROFILE_INCOMPLETE') {
          navigate('/patient/profile', { replace: true });
          return;
        }
        if (err.code === 'ACTIVE_TOKEN_EXISTS') {
          const existingId = err.details?.tokenId;
          navigate(existingId ? `/patient/tokens/${existingId}` : '/patient/tokens', { replace: true });
          return;
        }
        if (err.status === 401) {
          navigate('/patient/login', { replace: true });
          return;
        }
      }
      setStatus('error');
      setError(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading departments…</p>
      </div>
    );
  }

  if (step === 'dept') {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/patient/tokens')}
            className="text-slate-400 hover:text-slate-600"
          >
            ← Back
          </button>
          <h1 className="text-lg font-semibold text-slate-900">Select Department</h1>
        </div>
        <div className="flex flex-col gap-3">
          {departments.map((dept) => {
            const activeDoctors = dept.doctors.filter((d) => d.isActive).length;
            return (
              <Card
                key={dept.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => {
                  setSelected((s) => ({ ...s, dept, doctor: null }));
                  setStep('options');
                }}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-semibold text-slate-900">{dept.name}</p>
                    <p className="text-xs text-slate-500">
                      {activeDoctors} doctor{activeDoctors !== 1 ? 's' : ''} active
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-800">{dept.queueLength} waiting</p>
                    <p className="text-xs text-slate-500">~{dept.estimatedWaitMin} min wait</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // step === 'options'
  const activeDoctors = selected.dept?.doctors.filter((d) => d.isActive) ?? [];

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => { setStep('dept'); setError(null); setStatus('idle'); }}
          className="text-slate-400 hover:text-slate-600"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-slate-900">{selected.dept?.name}</h1>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Doctor</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
              <input
                type="radio"
                name="doctor"
                checked={selected.doctor === null}
                onChange={() => setSelected((s) => ({ ...s, doctor: null }))}
              />
              <div>
                <p className="text-sm font-medium">Auto-assign</p>
                <p className="text-xs text-slate-500">Doctor with shortest queue</p>
              </div>
            </label>
            {activeDoctors.map((doc) => (
              <label
                key={doc.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="doctor"
                  checked={selected.doctor?.id === doc.id}
                  onChange={() => setSelected((s) => ({ ...s, doctor: doc }))}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{doc.name}</p>
                  <p className="text-xs text-slate-500">
                    {doc.room} · {doc.queueLength} waiting · ~{doc.avgConsultMin} min/patient
                  </p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Priority</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {PRIORITIES.map(({ value, label }) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="priority"
                  checked={selected.priority === value}
                  onChange={() => setSelected((s) => ({ ...s, priority: value }))}
                />
                <p className="text-sm font-medium">{label}</p>
              </label>
            ))}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button onClick={handleBook} disabled={status === 'pending'} className="w-full">
          {status === 'pending' ? 'Booking…' : 'Confirm Booking'}
        </Button>
      </div>
    </div>
  );
}
