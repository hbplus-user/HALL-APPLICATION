import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { AuthContext } from './AuthContextInstance';

// ── Skeleton shown while Supabase resolves the auth session ──────────────────
const SK = {
  display: 'block',
  background: 'linear-gradient(90deg,rgba(169,103,77,.13) 25%,rgba(169,103,77,.26) 50%,rgba(169,103,77,.13) 75%)',
  backgroundSize: '600px 100%',
  animation: 'skShimmer 1.3s infinite linear',
  borderRadius: 8,
};

function SkeletonLoader() {
  return (
    <>
      <style>{`
        @keyframes skShimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
      `}</style>

      <div style={{ background: '#EDE0D0', minHeight: '100vh', padding: '20px', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(to right,#53372B,#A9674D)', borderRadius: '15px 15px 0 0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ ...SK, width: 150, height: 22, background: 'rgba(255,255,255,.22)' }} />
          <div style={{ ...SK, width: 90,  height: 32, borderRadius: 20, background: 'rgba(255,255,255,.18)' }} />
        </div>

        {/* White body */}
        <div style={{ background: '#fff', borderRadius: '0 0 15px 15px', padding: '20px 24px 32px', maxWidth: 1400, margin: '0 auto', boxShadow: '0 10px 30px rgba(0,0,0,.1)' }}>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ background: '#f9f6f2', borderRadius: 12, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <div style={{ ...SK, width: 38, height: 38, borderRadius: '50%' }} />
                <div style={{ ...SK, width: 60, height: 26 }} />
                <div style={{ ...SK, width: 90, height: 14 }} />
              </div>
            ))}
          </div>

          {/* Tabs bar */}
          <div style={{ display: 'flex', gap: 18, borderBottom: '2px solid #e8ddd5', marginBottom: 20 }}>
            {[130, 110, 130, 110, 130].map((w, i) => (
              <div key={i} style={{ ...SK, width: w, height: 15, margin: '10px 0' }} />
            ))}
          </div>

          {/* Table rows */}
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid #e8ddd5' }}>
              <div style={{ ...SK, width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ ...SK, width: 130, height: 14 }} />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ ...SK, width: 80,  height: 22, borderRadius: 20 }} />
                <div style={{ ...SK, width: 90,  height: 22, borderRadius: 20 }} />
                <div style={{ ...SK, width: 42,  height: 16 }} />
                <div style={{ ...SK, width: 68,  height: 28, borderRadius: 6 }} />
                <div style={{ ...SK, width: 48,  height: 28, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Helper to inspect localStorage synchronously for an active, unexpired session
const getInitialAuthState = () => {
  // If this is an OAuth callback (PKCE code or implicit token in URL), wait for
  // Supabase to finish the async exchange before rendering protected routes.
  const search = window.location.search;
  const hash = window.location.hash;
  if (search.includes('code=') || hash.includes('access_token=')) {
    return { currentAdmin: null, loading: true };
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = localStorage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val);
          if (parsed && parsed.user && parsed.expires_at) {
            const nowSeconds = Math.floor(Date.now() / 1000);
            if (parsed.expires_at > nowSeconds + 10) {
              const user = parsed.user;
              if (user.email && user.email.endsWith('@hbplus.fit')) {
                return { currentAdmin: user, loading: false };
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  try {
    let hasAnyToken = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        hasAnyToken = true;
        break;
      }
    }
    if (!hasAnyToken) {
      return { currentAdmin: null, loading: false };
    }
  } catch (e) {}

  return { currentAdmin: null, loading: true };
};

// ── Auth Provider ─────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(() => getInitialAuthState());
  const { currentAdmin, loading } = authState;

  const setCurrentAdmin = (admin) => {
    setAuthState(prev => ({ ...prev, currentAdmin: admin }));
  };

  const setLoading = (isLoading) => {
    setAuthState(prev => ({ ...prev, loading: isLoading }));
  };

  useEffect(() => {
    let active = true;

    // Safety timeout: Never let the app hang on the skeleton screen forever.
    const safetyTimer = setTimeout(() => {
      if (active) {
        setLoading(false);
      }
    }, 3500);

    // Step 1: getSession() reads from localStorage — zero network, ~5ms.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!active) return;
        clearTimeout(safetyTimer);
        const user = session?.user ?? null;
        setCurrentAdmin(user?.email?.endsWith('@hbplus.fit') ? user : null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(safetyTimer);
        setCurrentAdmin(null);
        setLoading(false);
      });

    // Step 2: onAuthStateChange runs the security check in the background.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;

      if (!user) {
        if (active) {
          setCurrentAdmin(null);
          setLoading(false);
        }
        return;
      }

      const email = user.email || '';
      if (!email.endsWith('@hbplus.fit')) {
        supabase.auth.signOut().then(() => {
          if (active) {
            setCurrentAdmin(null);
            setLoading(false);
          }
        });
        return;
      }

      // Check admins table whitelist in the background to avoid blocking Supabase client initialization.
      (async () => {
        try {
          const { data: adminRecord, error } = await supabase
            .from('admins')
            .select('id')
            .ilike('email', email)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.warn('Admins table unavailable, allowing by domain:', error.message);
          } else if (!adminRecord) {
            console.warn('Unauthorized: not in admins whitelist:', email);
            await supabase.auth.signOut();
            if (active) {
              setCurrentAdmin(null);
              setLoading(false);
            }
            return;
          }
        } catch (e) {
          console.warn('Admins whitelist check failed, allowing by domain:', e.message);
        }

        if (active) {
          setCurrentAdmin(user);
          setLoading(false);
        }
      })();
    });

    return () => {
      active = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/admin' }
    });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ currentAdmin, loginWithGoogle, logout, loading }}>
      {loading ? <SkeletonLoader /> : children}
    </AuthContext.Provider>
  );
};
