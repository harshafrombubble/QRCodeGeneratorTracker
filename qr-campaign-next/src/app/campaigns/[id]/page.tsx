import type { Campaign } from '@/types/supabase';
import CampaignDetails from './CampaignDetails';
import { cookies } from 'next/headers';

export default async function CampaignPage({
  params,
}: {
  params: { id: string };
}) {
  // Ensure cookies are awaited
  await cookies();
  
  return <CampaignDetails id={params.id} />;
} 