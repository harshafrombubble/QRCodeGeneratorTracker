'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useSupabase } from './supabase-provider';
import type { User } from '@supabase/auth-helpers-nextjs';

type AuthState = {
  user: User | null;
  isLoading: boolean;
};

const Context = createContext<AuthState>({
  user: null,
  isLoading: true,
});

export default function SupabaseAuthProvider({
  serverSession,
  children,
}: {
  serverSession: any;
  children: React.ReactNode;
}) {
  const { auth } = useSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Initial user check
    auth.getUser().then(({ data: { user }, error }) => {
      setUser(user);
      setIsLoading(false);
    });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = auth.onAuthStateChange(async (event, session) => {
      if (session) {
        const { data: { user }, error } = await auth.getUser();
        setUser(error ? null : user);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [auth]);

  const value = {
    user,
    isLoading,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useAuth = () => {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('useAuth must be used inside SupabaseAuthProvider');
  }
  return context;
}; 