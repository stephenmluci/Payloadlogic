'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, PenLine, Camera, CheckCircle, RotateCcw, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
// Adjust context import path based on actual app structure
import { useApp } from '@/context/AppContext';
import type { Load, ProofOfDelivery } from '@/types';
import { uploadSignedBolDocument } from '@/lib/storage';
import { compileDigitalBolPdf } from '@/lib/loadPacket';
import { DispatcherDateTimePicker } from '../common/DispatcherDateTimePicker';
import { formatAddress } from '@/lib/utils';

interface EpodModalProps {
  load: Load;
  isOpen: boolean;
  onClose: () => void;
  onPodSaved?: (pod: ProofOfDelivery) => void;
}

export default function EpodModal({ load, isOpen, onClose, onPodSaved }: EpodModalProps) {
  const { toast } = useToast();
  // Using optional chaining because useApp might not be fully typed yet
  const app = useApp?.();
  const updateLoad = app?.updateLoad;
  const savePOD = app?.savePOD;
  const user = app?.user;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureHistory, setSignatureHistory] = useState<string[]>([]);
  
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [receivedBy, setReceivedBy] = useState('');
  const [deliveredAt, setDeliveredAt] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      // Format to YYYY-MM-DDThh:mm for datetime-local input
      const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      
      setDeliveredAt(localDateTime);
      setReceivedBy('');
      setConditionNotes('');
      setPhotoDataUrl('');
      setHasSignature(false);
      setSignatureHistory([]);
      setSubmissionError(null);
      setIsSubmitting(false);
      
      // Delay canvas resize slightly to ensure it's rendered in DOM
      setTimeout(resizeCanvas, 50);
    }
  }, [isOpen]);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && canvas.parentElement) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const saveSignatureState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureHistory((prev) => [...prev, canvas.toDataURL()]);
      setHasSignature(true);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveSignatureState();
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      setHasSignature(false);
      setSignatureHistory([]);
    }
  };

  const undoSignature = () => {
    if (signatureHistory.length === 0) return;
    
    const newHistory = [...signatureHistory];
    newHistory.pop(); // Remove current state
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (canvas && ctx) {
      if (newHistory.length === 0) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
      } else {
        const img = new Image();
        img.src = newHistory[newHistory.length - 1];
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        setHasSignature(true);
      }
      setSignatureHistory(newHistory);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoDataUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getPosition = (): Promise<GeolocationPosition | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
      } else {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(position),
          (error) => {
            console.warn('Geolocation error:', error);
            resolve(null); // Continue even if GPS fails
          },
          { timeout: 5000 }
        );
      }
    });
  };

  const handleSubmit = async () => {
    setSubmissionError(null);
    setIsSubmitting(true);

    try {
      if (!hasSignature) {
        throw new Error('Please provide a receiver signature on the canvas to complete the BOL.');
      }

      if (!receivedBy.trim()) {
        throw new Error('Please enter the name of the person who received the load.');
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('Signature canvas is not available. Please try signing again.');
      }

      // 1. Double-check and extract signature image safely (base64 PNG and Blob)
      let signatureDataUrl = '';
      let signatureBlob: Blob | null = null;
      try {
        signatureDataUrl = canvas.toDataURL('image/png');
        if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
          // If toDataURL returned unexpected output, synthesize fallback data URL
          signatureDataUrl = canvas.toDataURL();
        }
      } catch (canvasErr: any) {
        console.warn('Canvas toDataURL warning:', canvasErr);
      }

      // Convert canvas to Blob asynchronously for direct storage upload compatibility
      try {
        signatureBlob = await new Promise<Blob | null>((resolve) => {
          if (canvas.toBlob) {
            canvas.toBlob((blob) => resolve(blob), 'image/png');
          } else {
            resolve(null);
          }
        });
      } catch (blobErr) {
        console.warn('Canvas toBlob conversion warning:', blobErr);
      }

      // If neither dataURL nor blob was obtained, throw a clear user-facing error
      if (!signatureDataUrl && !signatureBlob) {
        throw new Error('Unable to extract signature image from canvas. Please try signing again.');
      }

      // If we only have blob and no dataUrl, build dataUrl from blob
      if (!signatureDataUrl && signatureBlob) {
        signatureDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(signatureBlob!);
        });
      }

      const position = await getPosition();

      // If a delivery photo was provided as a heavy base64 data URL, upload it first
      let resolvedPhotoUrl = photoDataUrl;
      if (photoDataUrl && photoDataUrl.startsWith('data:') && photoDataUrl.length > 100_000) {
        try {
          const photoBlob = await (await fetch(photoDataUrl)).blob();
          const uploadedPhotoUrl = await uploadSignedBolDocument(
            load.id || 'pod-photo',
            photoBlob,
            `delivery_photo_${Date.now()}.jpg`
          );
          if (uploadedPhotoUrl) {
            resolvedPhotoUrl = uploadedPhotoUrl;
          }
        } catch (photoUploadErr) {
          console.warn('Could not upload separate delivery photo, continuing with inline image:', photoUploadErr);
        }
      }

      // Compile formal Digital Bill of Lading (BOL) PDF from load data + Sign-on-Glass signature
      let signedBolUrl = load.signedBolUrl || '';
      try {
        const digitalBolBlob = await compileDigitalBolPdf({
          load,
          carrierName: app?.settings?.carrierName,
          carrierDot: app?.settings?.carrierDotNumber,
          carrierMc: app?.settings?.carrierMcNumber,
          carrierAddress: app?.settings?.carrierAddress,
          receivedBy,
          deliveredAt,
          conditionNotes,
          signatureDataUrl,
          photoDataUrl: resolvedPhotoUrl,
        });
        signedBolUrl = await uploadSignedBolDocument(
          load.id || 'digital-pod',
          digitalBolBlob,
          `digital_bol_${Date.now()}.pdf`
        );
      } catch (pdfErr: any) {
        console.warn('Could not compile digital BOL PDF directly, using fallback image upload:', pdfErr);
        try {
          const fileToUpload = signatureBlob || (signatureDataUrl ? await (await fetch(signatureDataUrl)).blob() : null);
          if (fileToUpload) {
            signedBolUrl = await uploadSignedBolDocument(
              load.id || 'pod',
              fileToUpload,
              `signed_bol_${Date.now()}.png`
            );
          }
        } catch (uploadErr) {
          console.warn('Cloud storage fallback failed, persisting inline Data URL:', uploadErr);
          signedBolUrl = signatureDataUrl;
        }
      }
      
      const pod: ProofOfDelivery = {
        loadId: load.id || '',
        loadNumber: load.loadNumber,
        receivedBy,
        deliveredAt,
        conditionNotes,
        signatureDataUrl,
        signedBolUrl: signedBolUrl || undefined,
        ...(resolvedPhotoUrl ? { photoDataUrl: resolvedPhotoUrl } : {}),
        ...(position ? { gpsLat: position.coords.latitude, gpsLng: position.coords.longitude } : {}),
        submittedByDriverId: user?.driverProfileId || user?.uid,
        submittedByDriverName: user?.displayName || 'Unknown Driver',
      };

      if (savePOD) {
        try {
          await savePOD(pod);
        } catch (podSaveErr) {
          console.warn('Non-fatal: savePOD encountered an issue:', podSaveErr);
        }
      }

      if (updateLoad) {
        await updateLoad(load.id!, { 
          status: 'delivered', 
          driverPhase: 'Complete',
          signedBolUrl: signedBolUrl || undefined,
          signedBolUploadedAt: new Date().toISOString(),
          paperworkStatus: 'pod_uploaded',
        } as Partial<Load>);
      }

      toast({
        title: 'BOL Submitted',
        description: 'Bill of Lading has been recorded successfully.',
      });

      if (onPodSaved) {
        onPodSaved(pod);
      }
      onClose();
    } catch (error: any) {
      console.error('Error submitting BOL:', error);
      const errorMessage = error?.message || 'Network error or database permission issue. Please check your connection and try again.';
      setSubmissionError(`Submission failed: ${errorMessage}`);
      toast({
        title: 'Submission Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      // Explicitly guarantee the loading state is reset so the modal and submit button always unlock
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Digital Bill of Lading (Sign-on-Glass)
            </h2>
            <p className="text-slate-300 text-xs">
              System Generated • Load #{load.loadNumber || load.id}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
            disabled={isSubmitting}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          
          {/* 1. Delivery Summary Header */}
          <section className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-sm shadow-sm">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                ⚡ System Generated Digital BOL
              </span>
              <span className="text-xs text-slate-500 font-mono">#{load.loadNumber || load.id?.substring(0, 8)}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-700 block mb-0.5 text-xs">Shipper / Origin:</span>
              <p className="text-slate-900 text-xs">{formatAddress(load.origin)}</p>
            </div>
            <div className="h-px bg-slate-200 w-full" />
            <div>
              <span className="font-semibold text-slate-700 block mb-0.5 text-xs">Consignee / Destination:</span>
              <p className="text-slate-900 text-xs">{formatAddress(load.destination)}</p>
            </div>
            <div className="h-px bg-slate-200 w-full" />
            <div>
              <span className="font-semibold text-slate-700 block mb-0.5 text-xs">Cargo Details:</span>
              <p className="text-slate-900 text-xs">
                {load.cargoDescription || 'Freight'} — {load.cargoQuantity || 1} {load.cargoQuantity === 1 ? 'piece/pallet' : 'pieces/pallets'} / {load.cargoWeightNum ? `${load.cargoWeightNum.toLocaleString()} lbs` : 'Weight N/A'}
              </p>
            </div>
            <div className="h-px bg-slate-200 w-full" />
            <div>
              <span className="font-semibold text-slate-700 block mb-0.5 text-xs">Delivery Timestamp:</span>
              <p className="text-slate-900 text-xs">
                {deliveredAt ? new Date(deliveredAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Now'}
              </p>
            </div>
          </section>

          {/* 2. Signature Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2 text-slate-800">
                <PenLine className="w-5 h-5 text-blue-600" /> Receiver Signature *
              </Label>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearSignature}
                className="h-8 px-3 text-xs bg-white hover:bg-slate-50"
              >
                Clear / Redo
              </Button>
            </div>
            <div className="relative w-full bg-white border-2 border-dashed border-slate-300 rounded-xl overflow-hidden touch-none shadow-sm">
              <canvas
                ref={canvasRef}
                className="w-full h-[220px] cursor-crosshair relative z-10 bg-transparent"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                onTouchCancel={stopDrawing}
              />
              {!hasSignature && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0 select-none">
                  <span className="text-5xl mb-2 text-slate-200 font-light">X</span>
                  <p className="text-sm font-medium text-slate-400">Sign above using finger or stylus</p>
                </div>
              )}
            </div>
          </section>

          {/* 3. Signee Verification Fields */}
          <section className="space-y-4">
            <div className="space-y-2 relative z-20">
              <Label htmlFor="receivedBy" className="text-slate-800 font-medium">Print Receiver Name *</Label>
              <Input 
                id="receivedBy" 
                placeholder="Printed Name..." 
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="h-12 text-base border-slate-300 shadow-sm text-slate-900 bg-white"
                style={{ color: '#0f172a', backgroundColor: '#ffffff', pointerEvents: 'auto' }}
              />
            </div>
            
            <div className="space-y-2 relative z-20">
              <Label htmlFor="conditionNotes" className="text-slate-800 font-medium">Exception / Damage Notes (Optional)</Label>
              <Textarea 
                id="conditionNotes" 
                placeholder="e.g. Clean delivery, 1 damaged box, left at back door..." 
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                rows={2}
                className="resize-none border-slate-300 shadow-sm text-slate-900 bg-white"
                style={{ color: '#0f172a', backgroundColor: '#ffffff', pointerEvents: 'auto' }}
              />
            </div>
          </section>

          {/* Photo Section */}
          <section className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Camera className="w-4 h-4" /> Delivery Photo (Optional)
            </Label>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="relative overflow-hidden w-full sm:w-auto"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {photoDataUrl ? 'Retake Photo' : 'Capture Photo'}
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </Button>
                {photoDataUrl && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setPhotoDataUrl('')}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </Button>
                )}
              </div>
              
              {photoDataUrl && (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-200 bg-black/5">
                  <img 
                    src={photoDataUrl} 
                    alt="Delivery proof" 
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-3">
          {submissionError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block">Submission Error</span>
                <span>{submissionError}</span>
              </div>
            </div>
          )}

          <Button 
            className="w-full bg-green-600 hover:bg-green-700 text-white shadow-sm h-12 text-base font-medium transition-colors"
            onClick={handleSubmit}
            disabled={!hasSignature || !receivedBy.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Submitting BOL...
              </>
            ) : (
              'Submit Bill of Lading'
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
