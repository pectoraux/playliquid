'use client';

import { useState, useEffect } from 'react';

export interface Session {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  roles: string[];
  activeRole: string;
  isDemo: boolean;
  isPermanent: boolean;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/v2/session')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.authenticated) {
          // Map the raw session payload (which includes expiresAt) into our Session type.
          const s = data.session as Session & { expiresAt?: number };
          setSession({
            userId: s.userId,
            email: s.email,
            username: s.username,
            displayName: s.displayName,
            roles: s.roles,
            activeRole: s.activeRole,
            isDemo: s.isDemo,
            isPermanent: s.isPermanent,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading };
}
