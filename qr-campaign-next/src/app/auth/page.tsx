import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthForm from './auth-form';

export default async function Auth() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (user && !error) {
    redirect('/campaigns');
  }

  return <AuthForm />;
} 