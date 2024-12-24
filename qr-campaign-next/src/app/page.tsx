import { createServerSupabaseClient } from '@/utils/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function Home() {
  const supabase = createServerSupabaseClient();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth');
  }

  const { data: campaigns, error: campaignsError } = await supabase
    .from('Campaigns')
    .select('*')
    .eq('user', user.id)
    .order('created_at', { ascending: false });

  if (campaignsError) {
    console.error('Error loading campaigns:', campaignsError);
    return <div>Error loading campaigns</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Your Campaigns</h1>
          <Link
            href="/campaigns/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create New Campaign
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <p className="text-gray-600">You haven't created any campaigns yet.</p>
            <Link
              href="/campaigns/new"
              className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Create Your First Campaign
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="block bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <h2 className="text-xl font-semibold mb-2">{campaign.name}</h2>
                <div className="text-sm text-gray-500">
                  Created {new Date(campaign.created_at).toLocaleDateString()}
                </div>
                <div className="mt-4 flex justify-between text-sm">
                  <span>Flyers: {campaign.flyers}</span>
                  <span>Scans: {campaign.scans || 0}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 