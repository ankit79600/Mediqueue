import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.js';
import { logout } from '@/lib/auth.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusBadge } from '@/components/StatusBadge.jsx';
import { PriorityBadge } from '@/components/PriorityBadge.jsx';

function formatWait(min) {
  if (min == null) return '—';
  if (min < 1) return '< 1 min';
  return `~${Math.round(min)} min`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MyTokens() {
  const navigate = useNavigate();
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/tokens/me');
      setActive(data.active ?? []);
      setHistory(data.history ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate('/patient/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(tokenId) {
    setCancelling(tokenId);
    try {
      await api.delete(`/tokens/${tokenId}`);
    } catch {
      // INVALID_STATE = no longer WAITING; refresh shows reality
    } finally {
      setCancelling(null);
      load();
    }
  }

  function handleLogout() {
    logout();
    navigate('/patient/login', { replace: true });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">My Tokens</h1>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/patient/book')}>+ Book</Button>
          <Button variant="ghost" onClick={handleLogout}>Logout</Button>
        </div>
      </div>

      {active.length === 0 && history.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-slate-500">No tokens today.</p>
            <Button onClick={() => navigate('/patient/book')} className="mt-4">
              Book a token
            </Button>
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-slate-500">Active</h2>
          <div className="flex flex-col gap-3">
            {active.map((token) => (
              <Card key={token.id}>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{token.tokenNo}</CardTitle>
                  <div className="flex gap-1.5">
                    <PriorityBadge priority={token.priority} />
                    <StatusBadge status={token.status} />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Department</p>
                    <p className="font-medium">{token.departmentName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Doctor</p>
                    <p className="font-medium">{token.doctorName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">People ahead</p>
                    <p className="font-medium">
                      {token.status === 'CALLED' ? 'In consultation' : (token.peopleAhead ?? '—')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Est. wait</p>
                    <p className="font-medium">{formatWait(token.estimatedWaitMin)}</p>
                  </div>
                </CardContent>
                <div className="flex gap-2 px-4 pb-4">
                  <Link
                    to={`/patient/tokens/${token.id}`}
                    className="flex-1 rounded-md border border-slate-300 bg-white py-1.5 text-center text-sm font-medium hover:bg-slate-50"
                  >
                    Track live
                  </Link>
                  {token.status === 'WAITING' && (
                    <Button
                      variant="outline"
                      className="text-red-600 hover:border-red-300 hover:bg-red-50"
                      disabled={cancelling === token.id}
                      onClick={() => handleCancel(token.id)}
                    >
                      {cancelling === token.id ? 'Cancelling…' : 'Cancel'}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-500">Today's history</h2>
          <div className="flex flex-col gap-2">
            {history.map((token) => (
              <Card key={token.id} className="opacity-75">
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-slate-800">{token.tokenNo}</p>
                    <p className="text-xs text-slate-500">
                      {token.departmentName} · {token.doctorName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={token.status} />
                    <p className="text-xs text-slate-400">
                      {formatTime(token.endedAt ?? token.calledAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
