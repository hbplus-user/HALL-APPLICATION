import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

// Context — exported alone so Fast Refresh is happy
export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setCurrentAdmin(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;

      if (user) {
        const email = user.email || '';
        const isInternal = email.endsWith('@hbplus.fit');

        if (!isInternal) {
          console.warn('Unauthorized: not an @hbplus.fit account:', email);
          await supabase.auth.signOut();
          setCurrentAdmin(null);
          setLoading(false);
          return;
        }

        // Check whitelist in admins table (with timeout fallback)
        try {
          const { data: adminRecord } = await Promise.race([
            supabase.from('admins').select('id').eq('email', email).single(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
          ]);

          if (!adminRecord) {
            console.warn('Unauthorized: not in admins whitelist:', email);
            await supabase.auth.signOut();
            setCurrentAdmin(null);
            setLoading(false);
            return;
          }
        } catch (e) {
          // If admins table doesn't exist yet or times out, allow @hbplus.fit through
          console.warn('Admins table check failed, falling back to domain check only:', e.message);
        }
      }

      setCurrentAdmin(user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
      {!loading && children}
    </AuthContext.Provider>
  );
};
