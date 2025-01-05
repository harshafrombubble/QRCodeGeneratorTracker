'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useAuth } from '@/components/providers/supabase-auth-provider';
import { useSupabase } from '@/components/providers/supabase-provider';

const MAX_CAMPAIGNS = 5;

interface QRBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function NewCampaign() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const supabase = useSupabase();
  const [remainingCampaigns, setRemainingCampaigns] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  // Check remaining campaigns
  useEffect(() => {
    if (!user) return;

    const checkRemainingCampaigns = async () => {
      const { data: campaigns } = await supabase
        .from('Campaigns')
        .select('id')
        .eq('user', user.id);

      const remaining = MAX_CAMPAIGNS - (campaigns?.length || 0);
      setRemainingCampaigns(remaining);

      if (remaining <= 0) {
        alert('You have reached the maximum number of campaigns allowed.');
        router.push('/campaigns');
      }
    };

    checkRemainingCampaigns();
  }, [user, supabase, router]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth');
    }
  }, [user, isLoading, router]);

  const [file, setFile] = useState<File | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [campaignNameError, setCampaignNameError] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [flyerCount, setFlyerCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!file) return;

    const loadPreview = async () => {
      const fileUrl = URL.createObjectURL(file);
      setPreviewUrl(fileUrl);
    };

    loadPreview();

    // Cleanup
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || isSubmitting) return;

    // Validate campaign name before submission
    if (!campaignName) {
      setCampaignNameError('Campaign name is required');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(campaignName)) {
      setCampaignNameError('Only lowercase letters, numbers, and hyphens are allowed');
      return;
    }

    setIsSubmitting(true);
    setProgress(0);
    setTotalFiles(flyerCount);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('campaignName', campaignName);
      formData.append('targetUrl', targetUrl);
      formData.append('flyerCount', flyerCount.toString());
      formData.append('baseUrl', window.location.origin);

      const response = await fetch('/api/process-pdf', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 401) {
          router.push('/auth');
          return;
        }
        throw new Error(error.message || 'Failed to create campaign');
      }

      // Set up event source for progress updates
      const eventSource = new EventSource(`/api/progress/${campaignName}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.processed);
        
        if (data.processed === totalFiles) {
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      const result = await response.json();
      
      // Redirect to zip file
      window.location.href = result.zipUrl;
      
      setIsSuccess(true);
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      alert(error.message || 'Failed to create campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Campaign Created Successfully!</h1>
          <p className="mb-4">Your files have started downloading.</p>
          <a
            href="/campaigns"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Back to Campaigns
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Create New Campaign</h1>
      <p className="mb-4 text-gray-600">
        Upload a PDF or image file containing a QR code, and we'll create multiple versions with unique tracking URLs.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-2">File (PDF or Image):</label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="border p-2"
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Supported formats: PDF, PNG, JPG, JPEG
          </p>
        </div>

        <div>
          <label className="block mb-2">Campaign Name:</label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => {
              setCampaignName(e.target.value.toLowerCase());
              setCampaignNameError(null);
            }}
            placeholder="my-campaign"
            className="border p-2 w-full"
            required
          />
          {campaignNameError && (
            <p className="text-red-500 text-sm mt-1">{campaignNameError}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            Only lowercase letters, numbers, and hyphens are allowed
          </p>
        </div>

        <div>
          <label className="block mb-2">Target URL:</label>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com"
            className="border p-2 w-full"
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Users will be redirected to this URL when they scan the QR code
          </p>
        </div>

        <div>
          <label className="block mb-2">Number of Flyers:</label>
          <input
            type="number"
            value={flyerCount}
            onChange={(e) => setFlyerCount(parseInt(e.target.value))}
            min="1"
            max="100"
            className="border p-2"
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Maximum 100 flyers per campaign
          </p>
        </div>

        {file && previewUrl && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Preview:</h3>
            <div className="border p-4">
              {file.type === 'application/pdf' ? (
                <object
                  data={previewUrl}
                  type="application/pdf"
                  width="100%"
                  height="600px"
                >
                  <p>PDF preview not available</p>
                </object>
              ) : (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full h-auto"
                />
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className={`bg-blue-500 text-white px-4 py-2 rounded ${
            isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'
          }`}
        >
          {isSubmitting ? 'Creating Campaign...' : 'Create Campaign'}
        </button>
      </form>

      {isSubmitting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Generating Flyers...</h3>
            <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
              <div 
                className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                style={{ width: `${(progress / totalFiles) * 100}%` }}
              ></div>
            </div>
            <p className="text-center text-sm text-gray-600">
              Generated {progress} of {totalFiles} flyers
            </p>
          </div>
        </div>
      )}
    </div>
  );
} 