'use client';

import { notFound } from 'next/navigation';
import type { Campaign, Scan } from '@/types/supabase';
import CampaignAnalytics from './CampaignAnalytics';
import { useEffect, useState } from 'react';

interface CampaignWithScans extends Campaign {
  scan_data?: Scan[];
}

export default function CampaignDetails({ id }: { id: string }) {
  const [campaign, setCampaign] = useState<CampaignWithScans | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [newRedirectUrl, setNewRedirectUrl] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function loadCampaign() {
      try {
        const response = await fetch(`/api/campaigns/${id}`);
        
        if (!response.ok) {
          throw new Error('Failed to load campaign');
        }

        const data = await response.json();
        setCampaign(data);
      } catch (error) {
        console.error('Error loading campaign:', error);
        notFound();
      } finally {
        setIsLoading(false);
      }
    }

    loadCampaign();
  }, [id]);

  useEffect(() => {
    if (campaign?.url) {
      setNewRedirectUrl(campaign.url);
    }
  }, [campaign?.url]);

  const getSignedUrl = async (s3Key: string) => {
    try {
      const response = await fetch('/api/get-signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ s3Key }),
      });

      if (!response.ok) {
        throw new Error('Failed to get signed URL');
      }

      const { signedUrl } = await response.json();
      return signedUrl;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }
  };

  const handleExportCSV = async () => {
    if (!campaign?.Flyers) return;

    const csvContent = [
      ['Flyer ID', 'URL', 'Scans', 'Posted Date', 'Location'],
      ...campaign.Flyers.map(flyer => [
        flyer.id,
        flyer.url || 'N/A',
        flyer.scans || 0,
        flyer.posted_at ? new Date(flyer.posted_at).toLocaleString() : 'Not posted',
        flyer.lat && flyer.long ? `${flyer.lat},${flyer.long}` : 'No location data'
      ])
    ].map(row => row.map(value => `"${value}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${campaign.id}-data.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadAllPDFs = async () => {
    if (!campaign?.Flyers || isDownloading) return;
    setIsDownloading(true);

    try {
      // Get signed URLs for all PDFs
      const downloads = await Promise.all(
        campaign.Flyers.map(async flyer => {
          if (!flyer.s3_key) return null;
          const signedUrl = await getSignedUrl(flyer.s3_key);
          if (!signedUrl) return null;
          return { id: flyer.id, url: signedUrl };
        })
      );

      // Download each PDF
      downloads.forEach(download => {
        if (!download) return;
        const a = document.createElement('a');
        a.href = download.url;
        a.download = `flyer-${download.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    } catch (error) {
      console.error('Error downloading PDFs:', error);
      alert('Failed to download some PDFs. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUpdateRedirectUrl = async () => {
    if (!campaign || isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`/api/campaigns/${id}/update-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: newRedirectUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to update redirect URL');
      }

      // Update local state
      setCampaign(prev => prev ? { ...prev, url: newRedirectUrl } : null);
      setIsEditingUrl(false);
    } catch (error) {
      console.error('Error updating redirect URL:', error);
      alert('Failed to update redirect URL. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  const totalFlyers = campaign.Flyers?.length || 0;
  const totalScans = campaign.scans || 0;
  const averageScans = totalFlyers > 0 ? Math.round(totalScans / totalFlyers) : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white p-8 rounded-lg shadow space-y-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <div className="space-x-4">
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Export CSV
              </button>
              <button
                onClick={handleDownloadAllPDFs}
                disabled={isDownloading}
                className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md ${
                  isDownloading 
                    ? 'bg-blue-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isDownloading ? 'Downloading...' : 'Download All PDFs'}
              </button>
            </div>
          </div>

          {/* Redirect URL Section */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Redirect URL</h3>
                {!isEditingUrl && (
                  <p className="mt-1 text-sm text-gray-500">{campaign.url}</p>
                )}
              </div>
              {!isEditingUrl ? (
                <button
                  onClick={() => setIsEditingUrl(true)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Edit
                </button>
              ) : (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsEditingUrl(false)}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateRedirectUrl}
                    disabled={isUpdating}
                    className={`text-sm text-blue-600 hover:text-blue-800 ${
                      isUpdating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isUpdating ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            {isEditingUrl && (
              <div className="mt-2">
                <input
                  type="url"
                  value={newRedirectUrl}
                  onChange={(e) => setNewRedirectUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
          </div>

          <div className="text-sm text-gray-500">
            Created {new Date(campaign.created_at).toLocaleDateString()}
          </div>

          {/* Campaign Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-6 rounded-lg">
              <div className="text-sm text-blue-600 font-medium">Total Flyers</div>
              <div className="text-3xl font-bold text-blue-700">{totalFlyers}</div>
            </div>
            <div className="bg-green-50 p-6 rounded-lg">
              <div className="text-sm text-green-600 font-medium">Total Scans</div>
              <div className="text-3xl font-bold text-green-700">{totalScans}</div>
            </div>
            <div className="bg-purple-50 p-6 rounded-lg">
              <div className="text-sm text-purple-600 font-medium">Average Scans per Flyer</div>
              <div className="text-3xl font-bold text-purple-700">{averageScans}</div>
            </div>
          </div>

          {/* Analytics */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">Analytics</h2>
            <CampaignAnalytics 
              flyers={campaign.Flyers || []} 
              scan_data={campaign.scan_data || []}
            />
          </div>

          {/* Flyers Table */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">Flyers</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Flyer ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scans
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Posted Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {campaign.Flyers?.map((flyer) => (
                    <tr key={flyer.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {flyer.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {flyer.scans || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {flyer.posted_at
                          ? new Date(flyer.posted_at).toLocaleString()
                          : 'Not posted'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {flyer.lat && flyer.long ? (
                          <a
                            href={`https://www.google.com/maps?q=${flyer.lat},${flyer.long}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View on Map
                          </a>
                        ) : (
                          'No location data'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {flyer.s3_key ? (
                          <button
                            onClick={async () => {
                              const signedUrl = await getSignedUrl(flyer.s3_key!);
                              if (signedUrl) {
                                const a = document.createElement('a');
                                a.href = signedUrl;
                                a.download = `flyer-${flyer.id}.pdf`;
                                a.click();
                              }
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Download PDF
                          </button>
                        ) : (
                          'No PDF available'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 