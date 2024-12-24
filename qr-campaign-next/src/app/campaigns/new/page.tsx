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
  const [targetUrl, setTargetUrl] = useState('');
  const [flyerCount, setFlyerCount] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [qrBounds, setQrBounds] = useState<QRBounds | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!file || !pdfCanvasRef.current) return;

    const loadPDF = async () => {
      const fileUrl = URL.createObjectURL(file);
      setPdfPreviewUrl(fileUrl);
      
      // @ts-ignore
      const pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      try {
        const pdf = await pdfjsLib.getDocument(fileUrl).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });

        const canvas = pdfCanvasRef.current!;
        const context = canvas.getContext('2d');

        if (!context) return;

        // Store original PDF dimensions
        setPdfDimensions({
          width: viewport.width,
          height: viewport.height
        });

        // Set canvas size to match viewport
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Set up overlay canvas with same dimensions
        if (canvasRef.current) {
          canvasRef.current.width = viewport.width;
          canvasRef.current.height = viewport.height;
        }

      } catch (error) {
        alert('Error loading PDF. Please try a different file.');
      }
    };

    loadPDF();

    // Cleanup
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setQrBounds(null);
      setPdfDimensions(null);
      // Clear the canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !pdfDimensions) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = pdfDimensions.width / rect.width;
    const scaleY = pdfDimensions.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    setIsDrawing(true);
    setStartPoint({ x, y });
    setQrBounds(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !canvasRef.current || !pdfDimensions) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = pdfDimensions.width / rect.width;
    const scaleY = pdfDimensions.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear previous rectangle
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Scale context to match PDF coordinates
    const displayScaleX = canvasRef.current.width / rect.width;
    const displayScaleY = canvasRef.current.height / rect.height;
    
    // Draw new rectangle with black outline
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3 * Math.max(displayScaleX, displayScaleY);
    ctx.strokeRect(
      startPoint.x,
      startPoint.y,
      x - startPoint.x,
      y - startPoint.y
    );

    // Add semi-transparent red fill
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
    ctx.fillRect(
      startPoint.x,
      startPoint.y,
      x - startPoint.x,
      y - startPoint.y
    );
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !canvasRef.current || !pdfDimensions) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = pdfDimensions.width / rect.width;
    const scaleY = pdfDimensions.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Convert to PDF coordinates (flip Y axis)
    const newBounds = {
      x: Math.min(startPoint.x, x),
      y: pdfDimensions.height - Math.max(startPoint.y, y), // Flip Y coordinate for PDF
      width: Math.abs(x - startPoint.x),
      height: Math.abs(y - startPoint.y)
    };

    setIsDrawing(false);
    setQrBounds(newBounds);

    // Draw final rectangle
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    const displayScaleX = canvasRef.current.width / rect.width;
    const displayScaleY = canvasRef.current.height / rect.height;
    
    // Draw with black outline
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3 * Math.max(displayScaleX, displayScaleY);
    ctx.strokeRect(
      newBounds.x,
      pdfDimensions.height - newBounds.y - newBounds.height, // Convert back to canvas coordinates for display
      newBounds.width,
      newBounds.height
    );

    // Add semi-transparent red fill
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
    ctx.fillRect(
      newBounds.x,
      pdfDimensions.height - newBounds.y - newBounds.height, // Convert back to canvas coordinates for display
      newBounds.width,
      newBounds.height
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !qrBounds || isSubmitting) return;

    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('campaignName', campaignName);
      formData.append('targetUrl', targetUrl);
      formData.append('flyerCount', flyerCount.toString());
      formData.append('baseUrl', window.location.origin);
      formData.append('qrBounds', JSON.stringify(qrBounds));

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

      const result = await response.json();
      
      // Download individual flyers
      result.flyers.forEach((flyer: any) => {
        const a = document.createElement('a');
        a.href = flyer.signed_url;
        a.download = `flyer-${flyer.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });

      // Download merged PDF
      if (result.mergedPdfUrl) {
        const a = document.createElement('a');
        a.href = result.mergedPdfUrl;
        a.download = `campaign-${result.campaign.id}-all-flyers.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      setIsSuccess(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Campaign Created Successfully!</h1>
          <p className="mb-4">Your PDFs have started downloading.</p>
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
    <>
      <Script src="//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" />
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Create New Campaign</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-2">PDF File:</label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="border p-2"
              required
            />
          </div>

          {file && (
            <div className="border p-4 my-4">
              <p className="mb-2">Draw a rectangle around the QR code to replace:</p>
              <div style={{ position: 'relative' }}>
                <canvas
                  ref={pdfCanvasRef}
                  style={{
                    width: '100%',
                    height: 'auto'
                  }}
                />
                <canvas
                  ref={canvasRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'crosshair'
                  }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                />
              </div>
              {qrBounds && (
                <p className="mt-2 text-green-600">✓ QR code bounds selected</p>
              )}
            </div>
          )}

          <div>
            <label className="block mb-2">Campaign Name:</label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="border p-2 w-full"
              required
            />
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
            <p className="mt-1 text-sm text-gray-500">
              This is the URL that users will be redirected to when they scan the QR code.
            </p>
          </div>

          <div>
            <label className="block mb-2">Number of Flyers:</label>
            <input
              type="number"
              min="1"
              value={flyerCount}
              onChange={(e) => setFlyerCount(parseInt(e.target.value))}
              className="border p-2"
              required
            />
          </div>

          <button
            type="submit"
            disabled={!file || !qrBounds || isSubmitting || remainingCampaigns === 0}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
          >
            {isSubmitting ? 'Creating Campaign...' : remainingCampaigns !== null ? `Create Campaign (${remainingCampaigns} out of ${MAX_CAMPAIGNS} left)` : 'Create Campaign'}
          </button>
        </form>
      </div>
    </>
  );
} 