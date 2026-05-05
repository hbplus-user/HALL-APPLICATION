import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AuthProvider: Initializing...');
    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log('AuthProvider: Session retrieved:', session?.user?.email || 'No session');
        setCurrentAdmin(session?.user ?? null);
        setLoading(false);
      })
      .catch(err => {
        console.error('AuthProvider: Error getting session:', err);
        setLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      
      if (user) {
        const email = user.email || '';
        const isInternal = email.endsWith('@hbplus.fit');
        
        // Check if user is in the 'admins' table (whitelist)
        const { data: adminRecord } = await supabase
          .from('admins')
          .select('id')
          .eq('email', email)
          .single();

        if (!isInternal || !adminRecord) {
          console.warn('Unauthorized admin access attempt:', email);
          await supabase.auth.signOut();
          setCurrentAdmin(null);
          // We can't easily show a notification here because we're in the provider,
          // but logging out is the primary security measure.
          return;
        }
      }

      setCurrentAdmin(user);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/admin'
      }
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
