'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Helper function to get error message
function getGeolocationErrorMessage(error: GeolocationPositionError) {
  switch(error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Please enable location access and try again.';
    case error.POSITION_UNAVAILABLE:
      return 'Location information is unavailable. Please try again.';
    case error.TIMEOUT:
      return 'Location request timed out. Click "Try Again" to retry.';
    default:
      return 'An unknown error occurred getting your location.';
  }
}

export default function LocationPrompt() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const searchParams = useSearchParams();
  const flyerId = searchParams.get('flyerId');
  const campaignId = searchParams.get('campaignId');
  const redirectUrl = searchParams.get('redirectUrl');

  const requestLocation = async () => {
    setIsLoading(true);
    setError(null);

    if (!flyerId || !campaignId || !redirectUrl) {
      console.log('LocationPrompt: Missing required parameters');
      setError('Missing required parameters');
      setIsLoading(false);
      return;
    }

    // Request location from user
    if ('geolocation' in navigator) {
      console.log('LocationPrompt: Requesting geolocation (attempt ' + (retryCount + 1) + ')');
      
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            {
              enableHighAccuracy: false,
              timeout: 30000, // Increased to 30 seconds
              maximumAge: 60000 // Increased cache time to 1 minute
            }
          );
        });

        console.log('LocationPrompt: Got position:', {
          lat: position.coords.latitude,
          long: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString()
        });
        
        console.log('LocationPrompt: Updating flyer location via API');
        
        const response = await fetch('/api/update-location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            flyerId,
            campaignId,
            lat: position.coords.latitude,
            long: position.coords.longitude
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update location');
        }

        console.log('LocationPrompt: Successfully updated location');
        console.log('LocationPrompt: Redirecting to:', redirectUrl);
        window.location.href = redirectUrl;

      } catch (error: any) {
        console.error('LocationPrompt: Error:', error);
        if (error instanceof GeolocationPositionError) {
          setError(getGeolocationErrorMessage(error));
        } else {
          setError(error.message);
        }
        setIsLoading(false);
      }
    } else {
      console.log('LocationPrompt: Geolocation not supported');
      setError('Location services are not supported by your browser.');
      setIsLoading(false);
    }
  };

  // Initial location request
  useEffect(() => {
    requestLocation();
  }, []);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    requestLocation();
  };

  const handleSkipLocation = () => {
    console.log('LocationPrompt: Skipping location, updating scan count only');
    setIsLoading(true);
    
    // Still update scan count even if skipping location
    fetch('/api/update-location', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        flyerId,
        campaignId,
        lat: null,
        long: null
      })
    }).finally(() => {
      console.log('LocationPrompt: Continuing without location to:', redirectUrl);
      window.location.href = redirectUrl || '/';
    });
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full space-y-4">
          <h1 className="text-xl font-bold text-red-600">Error</h1>
          <p className="text-gray-600">{error}</p>
          <div className="flex flex-col space-y-2">
            {error.includes('timed out') && (
              <button
                onClick={handleRetry}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Try Again ({retryCount + 1}/3)
              </button>
            )}
            <button
              onClick={handleSkipLocation}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Continue without location
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full space-y-4">
        <h1 className="text-xl font-bold">Requesting Location</h1>
        <p className="text-gray-600">
          Please allow access to your location to help track the effectiveness of this flyer.
          This will only be used once to record where this flyer was scanned.
        </p>
        {isLoading && (
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-500">
              Getting your location... This may take a few seconds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 