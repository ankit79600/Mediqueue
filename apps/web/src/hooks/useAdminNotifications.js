import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api.js';
import * as realSocket from '@/lib/socket.js';
import * as mockSocket from '@/mocks/mockSocket.js';
import { notifications as mockNotifications } from '@/mocks/fixtures.js';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const socket = USE_MOCKS ? mockSocket : realSocket;
const PAGE_SIZE = 50;

// API_CONTRACT.md E22 `GET /admin/notifications?limit&before` for history +
// paging; SOCKET_CONTRACT.md `notification:new` (room `admin`) prepended live
// on top, per IMPLEMENTATION_PLAN.md Phase 14 "SmsLog.jsx (E22 + notification:new
// prepend)". This page keeps its own admin-room subscription (independent of
// AdminDashboard's — each mounted page subscribes/unsubscribes on its own,
// same pattern as Staff's per-page doctor-room subscriptions).
function fetchPage(before) {
  if (USE_MOCKS) {
    return Promise.resolve({ items: before ? [] : mockNotifications, nextBefore: null });
  }
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (before) params.set('before', before);
  return api.get(`/admin/notifications?${params.toString()}`);
}

export function useAdminNotifications() {
  const [items, setItems] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const seenIds = useRef(new Set());

  // No setState before the first `await` — the mount effect calls this
  // directly, and React's set-state-in-effect check flags any setState that
  // runs synchronously as part of the effect body's call graph. Both
  // `status` and `error` already have sane initial/cleared values, so this
  // only ever needs to set them from inside the async continuation.
  const loadFirstPage = useCallback(async () => {
    try {
      const { items: page, nextBefore: next } = await fetchPage(null);
      seenIds.current = new Set(page.map((n) => n.id));
      setItems(page);
      setNextBefore(next);
      setStatus('ready');
      setError(null);
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: page, nextBefore: next } = await fetchPage(nextBefore);
      setItems((prev) => [...prev, ...page.filter((n) => !seenIds.current.has(n.id))]);
      page.forEach((n) => seenIds.current.add(n.id));
      setNextBefore(next);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore]);

  useEffect(() => {
    // Deferred via .then() rather than called directly — same reasoning as
    // the comment on loadFirstPage above.
    Promise.resolve().then(loadFirstPage);

    socket.subscribe(socket.SOCKET_EVENTS.SUBSCRIBE_ADMIN, {}, {}).catch(() => {
      // History (E22) already loaded above; a failed live subscribe just
      // means no further live rows arrive — not a page-level error.
    });

    const offNew = socket.on(socket.SOCKET_EVENTS.NOTIFICATION_NEW, (notification) => {
      if (!notification?.id || seenIds.current.has(notification.id)) return;
      seenIds.current.add(notification.id);
      setItems((prev) => [notification, ...prev]);
    });

    return () => {
      socket.unsubscribe(socket.rooms.admin());
      offNew();
    };
  }, [loadFirstPage]);

  return { items, status, error, hasMore: nextBefore != null, loadingMore, loadMore, refetch: loadFirstPage };
}
