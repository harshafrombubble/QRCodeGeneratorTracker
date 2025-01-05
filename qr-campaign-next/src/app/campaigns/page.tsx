'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/supabase-auth-provider';
import { useSupabase } from '@/components/providers/supabase-provider';

const MAX_CAMPAIGNS = 5;

export default function CampaignsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const supabase = useSupabase();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  console.log('Render state:', { user, isAuthLoading, isLoading, campaignsLength: campaigns.length });

  const loadCampaigns = useCallback(async () => {
    console.log('loadCampaigns called, user:', user?.id);
    if (!user) {
      console.log('No user, setting loading to false');
      setIsLoading(false);
      return;
    }
    
    try {
      console.log('Fetching campaigns for user:', user.id);
      const { data: campaigns, error } = await supabase
        .from('Campaigns')
        .select('*')
        .eq('user', user.id)
        .order('created_at', { ascending: false });

      console.log('Query result:', { campaigns, error });

      if (error) throw error;
      setCampaigns(campaigns || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      alert('Failed to load campaigns');
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    console.log('Effect running, auth state:', { user: user?.id, isAuthLoading });
    if (!isAuthLoading && !user) {
      console.log('No user and not loading, redirecting to auth');
      router.push('/auth');
      return;
    }

    loadCampaigns();
  }, [user, router, loadCampaigns, isAuthLoading]);

  const handleDelete = async (campaignId: string, campaignName: string) => {
    if (!confirm(`Are you sure you want to delete campaign "${campaignName}"?`)) {
      return;
    }

    setIsDeleting(campaignId);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete campaign');
      }

      // Refresh the campaigns list
      await loadCampaigns();

    } catch (error: any) {
      console.error('Error deleting campaign:', error);
      alert(error.message || 'Failed to delete campaign');
    } finally {
      setIsDeleting(null);
    }
  };

  const remainingCampaigns = MAX_CAMPAIGNS - (campaigns?.length || 0);
  const canCreateCampaign = remainingCampaigns > 0;

  if ((isLoading || isAuthLoading) && !campaigns.length) {
    return (
      <div className="container mx-auto p-4">
        <p className="text-center">Loading campaigns...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your Campaigns</h1>
        {canCreateCampaign ? (
          <a
            href="/campaigns/new"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Create Campaign ({remainingCampaigns} out of {MAX_CAMPAIGNS} left)
          </a>
        ) : (
          <span className="text-red-500">
            Maximum campaigns limit reached ({MAX_CAMPAIGNS})
          </span>
        )}
      </div>

      <div className="grid gap-4">
        {campaigns?.map((campaign) => (
          <div
            key={campaign.id}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold mb-2">{campaign.name}</h2>
                <div className="text-sm text-gray-600">
                  <p>Created: {new Date(campaign.created_at).toLocaleDateString()}</p>
                  <p>Number of Flyers: {campaign.flyers}</p>
                </div>
                <a
                  href={`/campaigns/${campaign.id}`}
                  className="text-blue-500 hover:underline mt-2 inline-block"
                >
                  View Details →
                </a>
              </div>
              <button
                onClick={() => handleDelete(campaign.id, campaign.name)}
                disabled={isDeleting === campaign.id}
                className={`text-red-500 hover:text-red-700 px-3 py-1 rounded border border-red-500 hover:border-red-700 ${
                  isDeleting === campaign.id ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isDeleting === campaign.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}

        {(!campaigns || campaigns.length === 0) && !isLoading && (
          <p className="text-gray-500 text-center py-8">
            No campaigns yet. Create your first campaign!
          </p>
        )}
      </div>
    </div>
  );
} 