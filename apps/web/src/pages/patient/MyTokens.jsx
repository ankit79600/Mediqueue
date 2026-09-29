import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Clock, Ticket, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api.js';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusBadge } from '@/components/StatusBadge.jsx';

function formatWait(min) {
  if (min == null) return '—';
  if (min < 1) return '< 1 min';
  return `~${Math.round(min)} min`;
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MyTokens() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await api.get('/tokens/me');
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate('/patient/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  async function handleCancel(tokenId) {
    setCancelling(tokenId);
    try {
      await api.delete(`/tokens/${tokenId}`);
      fetchTokens();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_STATE') fetchTokens();
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#5b6b82]">
        <Loader2 className="size-6 animate-spin" />
        <p className="mt-2 text-sm">Loading tokens…</p>
      </div>
    );
  }

  const active = data?.active ?? [];
  const history = data?.history ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#0f172a]">My Tokens</h1>
        <Button size="sm" onClick={() => navigate('/patient/book')} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          Book
        </Button>
      </div>

      {/* Active tokens */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#5b6b82]">Active</p>
        {active.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-[#eef2f7]">
                <Ticket className="size-6 text-[#5b6b82]" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-[#0f172a]">No active tokens</p>
                <p className="mt-0.5 text-sm text-[#5b6b82]">Book a token to join the queue.</p>
              </div>
              <Button onClick={() => navigate('/patient/book')}>Book a token</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {active.map((token) => (
              <Card key={token.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-3xl font-bold tracking-tight text-[#0f172a]">{token.tokenNo}</p>
                      <p className="mt-0.5 text-sm font-medium text-[#5b6b82]">{token.departmentName}</p>
                      <p className="text-xs text-[#5b6b82]">{token.doctorName}</p>
                    </div>
                    <StatusBadge status={token.status} />
                  </div>

                  {token.status === 'WAITING' && (
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f4f7fb] p-3">
                      <div>
                        <p className="text-xs text-[#5b6b82]">People ahead</p>
                        <p className="text-lg font-bold text-[#0f172a]">{token.peopleAhead ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5b6b82]">Est. wait</p>
                        <p className="text-lg font-bold text-[#0284c7]">{formatWait(token.estimatedWaitMin)}</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      to={`/patient/tokens/${token.id}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#e0f2fe] py-2 text-sm font-medium text-[#0284c7] hover:bg-[#bae6fd] transition-colors"
                    >
                      Track live
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                    {token.status === 'WAITING' && (
                      <button
                        onClick={() => handleCancel(token.id)}
                        disabled={cancelling === token.id}
                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {cancelling === token.id ? <Loader2 className="size-4 animate-spin" /> : 'Cancel'}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#5b6b82]">History</p>
          <div className="flex flex-col gap-2">
            {history.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between rounded-2xl border border-[#e2e8f0] bg-white/70 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-[#eef2f7]">
                    <Clock className="size-4 text-[#5b6b82]" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0f172a]">{token.tokenNo}</p>
                    <p className="text-xs text-[#5b6b82]">{token.departmentName} · {formatTime(token.createdAt)}</p>
                  </div>
                </div>
                <StatusBadge status={token.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
