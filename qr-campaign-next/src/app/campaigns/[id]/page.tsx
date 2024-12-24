import type { Campaign } from '@/types/supabase';
import CampaignDetails from './CampaignDetails';
import { cookies } from 'next/headers';

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Ensure cookies are awaited
  await cookies();
  const { id } = await params;
  return <CampaignDetails id={id} />;
} 