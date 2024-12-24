import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const MAX_CAMPAIGNS = 5;

export default async function CampaignsPage() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth');
  }

  // Get campaigns for authenticated user
  const { data: campaigns } = await supabase
    .from('Campaigns')
    .select('*')
    .eq('user', user.id)
    .order('created_at', { ascending: false });

  const remainingCampaigns = MAX_CAMPAIGNS - (campaigns?.length || 0);
  const canCreateCampaign = remainingCampaigns > 0;

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
        ))}

        {(!campaigns || campaigns.length === 0) && (
          <p className="text-gray-500 text-center py-8">
            No campaigns yet. Create your first campaign!
          </p>
        )}
      </div>
    </div>
  );
} 