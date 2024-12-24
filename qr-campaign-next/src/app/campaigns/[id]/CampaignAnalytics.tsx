'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { Flyer } from '@/types/supabase';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Dynamically import Leaflet components with no SSR
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

// Fix for default marker icons in Leaflet with Next.js
const getIcon = () => {
  if (typeof window === 'undefined') return null;
  
  // Dynamically import Leaflet
  const L = require('leaflet');
  return L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};

interface Props {
  flyers: Flyer[];
  scan_data: Array<{
    id: string;
    scan_time: string;
    flyer: string;
    campaign: string;
    lat?: number;
    long?: number;
  }>;
}

export default function CampaignAnalytics({ flyers: initialFlyers, scan_data }: Props) {
  const [hasLocations, setHasLocations] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const [icon, setIcon] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedFlyers, setSelectedFlyers] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('all');
  const [filteredScans, setFilteredScans] = useState(scan_data);
  const [editingFlyerId, setEditingFlyerId] = useState<number | null>(null);
  const [newRedirectUrl, setNewRedirectUrl] = useState('');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [flyers, setFlyers] = useState(initialFlyers);
  
  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      setIcon(getIcon());
    }
  }, []);

  useEffect(() => {
    setFlyers(initialFlyers);
    console.log('All Flyer Data:', initialFlyers.map(flyer => ({
      id: flyer.id,
      flyerId: flyer.flyerId,
      url: flyer.url,
      redirect_url: flyer.redirect_url,
      scans: flyer.scans,
      campaign: flyer.campaign,
      campaign_name: flyer.campaign_name
    })));
  }, [initialFlyers]);

  useEffect(() => {
    // Filter scans based on selected flyers and time range
    let filtered = scan_data;

    if (selectedFlyers.length > 0) {
      filtered = filtered.filter(scan => selectedFlyers.includes(scan.flyer));
    }

    if (timeRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      switch (timeRange) {
        case '24h':
          cutoff.setHours(now.getHours() - 24);
          break;
        case '7d':
          cutoff.setDate(now.getDate() - 7);
          break;
        case '30d':
          cutoff.setDate(now.getDate() - 30);
          break;
      }
      filtered = filtered.filter(scan => new Date(scan.scan_time) >= cutoff);
    }

    setFilteredScans(filtered);
  }, [scan_data, selectedFlyers, timeRange]);

  useEffect(() => {
    const locationsWithCoords = flyers.filter(flyer => flyer.lat && flyer.long);
    setHasLocations(locationsWithCoords.length > 0);

    if (locationsWithCoords.length > 0) {
      const center: [number, number] = locationsWithCoords.reduce(
        (acc, flyer) => [
          acc[0] + (flyer.lat || 0) / locationsWithCoords.length,
          acc[1] + (flyer.long || 0) / locationsWithCoords.length
        ],
        [0, 0]
      );
      setMapCenter(center);
    }
  }, [flyers]);

  // Prepare data for charts
  const flyerData = flyers.map(flyer => ({
    id: flyer.id,
    scans: flyer.scans || 0,
  }));

  // Get scan times for time-based analysis
  const scansByDay = filteredScans.reduce<{ [key: string]: number }>((acc, scan) => {
    const date = new Date(scan.scan_time).toLocaleDateString();
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const timeData = Object.entries(scansByDay)
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([date, count]) => ({
      date,
      scans: count,
    }));

  // Get scan times by hour for the last 24 hours
  const scansByHour = filteredScans.reduce<{ [key: string]: number }>((acc, scan) => {
    const hour = new Date(scan.scan_time).toLocaleTimeString([], { hour: '2-digit' });
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {});

  const hourlyData = Object.entries(scansByHour)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, count]) => ({
      hour,
      scans: count,
    }));

  if (!isClient) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div>
          <label className="block text-sm font-medium text-gray-700">Time Range</label>
          <select
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Filter by Flyer</label>
          <select
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            multiple
            value={selectedFlyers}
            onChange={(e) => setSelectedFlyers(Array.from(e.target.selectedOptions, option => option.value))}
          >
            {flyers.map(flyer => (
              <option key={flyer.flyerId} value={flyer.flyerId}>
                Flyer {flyer.id} ({flyer.scans || 0} scans)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Flyers Management */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Flyers Management</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flyer ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scans</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Redirect URL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {flyers.map((flyer) => (
                <tr key={flyer.flyerId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{flyer.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{flyer.scans || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {editingFlyerId === flyer.flyerId ? (
                      <input
                        type="text"
                        value={newRedirectUrl}
                        onChange={(e) => setNewRedirectUrl(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        placeholder="Enter new URL"
                      />
                    ) : (
                      flyer.redirect_url || 'No URL set'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {editingFlyerId === flyer.flyerId ? (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            setIsUpdating(true);
                            setUpdateError(null);
                            try {
                              const response = await fetch('/api/update-redirect-url', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  flyerId: flyer.flyerId,
                                  newUrl: newRedirectUrl,
                                }),
                              });

                              if (!response.ok) {
                                const data = await response.json();
                                throw new Error(data.error || 'Failed to update URL');
                              }

                              // Update the flyer in the local state
                              const updatedFlyers = flyers.map(f => 
                                f.flyerId === flyer.flyerId ? { ...f, redirect_url: newRedirectUrl } : f
                              );
                              setFlyers(updatedFlyers);
                              
                              setEditingFlyerId(null);
                              setNewRedirectUrl('');
                            } catch (error: any) {
                              setUpdateError(error.message);
                              console.error('Error updating redirect URL:', error);
                            } finally {
                              setIsUpdating(false);
                            }
                          }}
                          disabled={isUpdating}
                          className="text-green-600 hover:text-green-900 disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingFlyerId(null);
                            setNewRedirectUrl('');
                            setUpdateError(null);
                          }}
                          disabled={isUpdating}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingFlyerId(flyer.flyerId);
                          setNewRedirectUrl(flyer.redirect_url || '');
                          setUpdateError(null);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit URL
                      </button>
                    )}
                    {updateError && editingFlyerId === flyer.flyerId && (
                      <p className="text-red-500 text-sm mt-1">{updateError}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scans per Flyer Chart */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Scans per Flyer</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={flyerData}
              margin={{ top: 20, right: 30, left: 20, bottom: 65 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="id" 
                label={{ 
                  value: 'Flyer ID', 
                  position: 'bottom',
                  offset: 40
                }}
              />
              <YAxis />
              <Tooltip />
              <Legend verticalAlign="top" />
              <Bar dataKey="scans" fill="#4F46E5" name="Number of Scans" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scans Over Time Chart */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Scans Over Time</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="scans" stroke="#10B981" name="Scans per Day" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly Scan Distribution */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Hourly Scan Distribution</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="scans" fill="#8B5CF6" name="Scans per Hour" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scan Details Table */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Recent Scans</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flyer ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredScans.slice(0, 10).map((scan) => (
                <tr key={scan.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(scan.scan_time).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {scan.flyer}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {scan.redirect_url || 'No URL'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 