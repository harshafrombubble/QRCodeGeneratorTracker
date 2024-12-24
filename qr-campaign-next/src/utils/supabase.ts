import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Client-side Supabase client (use in components)
export const createBrowserSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase client-side credentials');
  }
  
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}; 