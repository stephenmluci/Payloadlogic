'use client';

import React, { useContext, useRef, useState } from 'react';
import { Camera, Upload, FileText, CheckCircle2, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { uploadSignedBolDocument } from '@/lib/storage';
import { useApp } from '@/context/AppContext';
import { hasLoadPod, isLoadReadyForPodUpload } from '@/lib/loadStatus';
import type { Load } from '@/types';

interface SignedBolUploadProps {
  load: Load;
  onUploadSuccess?: (downloadUrl: string) => void;
  updateLoad?: (id: string, updates: Partial<Load>) => Promise<void>;
  compact?: boolean;
  /** Mobile-optimized layout for Driver View active dispatch cards */
  variant?: 'default' | 'driver';
  className?: string;
  label?: string;
}

function useOptionalAppUpdateLoad(): ((id: string, updates: Partial<Load>) => Promise<void>) | undefined {
  try {
    const app = useApp();
    return app?.updateLoad;
  } catch {
    // Rendered outside AppProvider (e.g. magic-link /driver-portal/[token])
    return undefined;
  }
}

export function SignedBolUpload({
  load,
  onUploadSuccess,
  updateLoad,
  compact = false,
  variant = 'default',
  className = '',
  label,
}: SignedBolUploadProps) {
  const { toast } = useToast();
  const contextUpdateLoad = useOptionalAppUpdateLoad();
  const effectiveUpdateLoad = updateLoad || contextUpdateLoad;

  // File/photo picker WITHOUT `capture` so mobile browsers allow Photo Library, Files (PDF), OR Camera
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Dedicated rear-camera input for 1-tap photo capture on mobile devices
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [optimisticBolUrl, setOptimisticBolUrl] = useState<string | null>(null);

  const resolvedBolUrl = load.signedBolUrl || optimisticBolUrl || '';
  const hasSignedBol = Boolean(resolvedBolUrl) || hasLoadPod(load);

  const handleTriggerFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleTriggerCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !load.id) return;

    // Validate size (max 25MB raw camera image or PDF)
    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Please select a photo or PDF under 25MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress('Uploading signed BOL / POD…');

    try {
      const downloadUrl = await uploadSignedBolDocument(load.id, file, file.name);
      const uploadedAt = new Date().toISOString();

      if (effectiveUpdateLoad) {
        await effectiveUpdateLoad(load.id, {
          signedBolUrl: downloadUrl,
          signedBolUploadedAt: uploadedAt,
          paperworkStatus: 'pod_uploaded',
        });
      }

      setOptimisticBolUrl(downloadUrl);

      if (onUploadSuccess) {
        onUploadSuccess(downloadUrl);
      }

      toast({
        title: 'Signed BOL / POD Uploaded',
        description: `Signed paperwork saved for Load #${load.loadNumber || load.id.substring(0, 8)}.`,
      });
    } catch (err: any) {
      console.error('Failed to upload signed BOL:', err);
      toast({
        title: 'Upload Failed',
        description: err?.message || 'Could not complete upload. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const sharedInputs = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        onChange={handleFileSelected}
        className="hidden"
        aria-label="Choose Signed BOL / POD photo or file"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
        aria-label="Take photo of Signed BOL / POD"
      />
    </>
  );

  // ── Compact Mode (Dispatcher LoadCard & inline rows) ──
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {sharedInputs}

        {hasSignedBol ? (
          <div className="flex items-center gap-1.5">
            <a
              href={resolvedBolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold transition-colors"
              title="View Signed BOL / POD document"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Signed BOL Uploaded</span>
              <ExternalLink className="w-3 h-3 text-emerald-600" />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleTriggerFilePicker}
              disabled={isUploading}
              className="h-7 px-1.5 text-slate-500 hover:text-slate-700"
              title="Replace signed document"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleTriggerFilePicker}
            disabled={isUploading}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs h-8 flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading…</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>{label || 'Upload Signed BOL / POD'}</span>
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  // ── Driver View Card Mode (Mobile-First Active Dispatch Card) ──
  if (variant === 'driver') {
    const isAtDeliveryStage = isLoadReadyForPodUpload(load);
    if (!hasSignedBol && !isAtDeliveryStage) {
      return null;
    }

    return (
      <div
        className={`rounded-xl border p-3 transition-all ${
          hasSignedBol
            ? 'bg-emerald-50/80 border-emerald-300'
            : 'bg-amber-50 border-2 border-amber-400 shadow-xs'
        } ${className}`}
      >
        {sharedInputs}

        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {hasSignedBol ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Camera className="w-4 h-4 text-amber-700 shrink-0" />
            )}
            <span className="text-xs font-extrabold text-slate-900 truncate">
              {label || 'Signed BOL / POD'}
            </span>
          </div>
          {hasSignedBol ? (
            <Badge className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 shrink-0">
              ✓ Uploaded
            </Badge>
          ) : (
            <Badge className="bg-amber-200 text-amber-950 border border-amber-300 text-[10px] font-bold px-2 py-0.5 shrink-0">
              Action Needed
            </Badge>
          )}
        </div>

        {hasSignedBol ? (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <p className="text-[11px] text-emerald-900 font-medium leading-snug">
              Signed paperwork attached and visible to dispatch.
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {resolvedBolUrl && (
                <a
                  href={resolvedBolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                >
                  <span>View</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTriggerCamera}
                disabled={isUploading}
                className="h-8 px-2.5 border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 text-xs font-semibold"
                title="Retake photo of signed BOL / POD"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isUploading ? 'animate-spin' : ''}`} />
                <span>Replace</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-amber-950/85 leading-snug">
              Have the receiver sign the BOL, then take a clear photo or upload a file from your phone.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                onClick={handleTriggerCamera}
                disabled={isUploading}
                className="flex-1 min-h-[44px] h-11 bg-amber-600 hover:bg-amber-500 active:scale-[0.99] text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                title="Open camera to photograph signed BOL / POD"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading Signed BOL…</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>Take Photo</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleTriggerFilePicker}
                disabled={isUploading}
                className="min-h-[44px] h-11 px-3.5 border-amber-400 bg-white hover:bg-amber-100 active:scale-[0.99] text-amber-950 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                title="Choose an existing photo or PDF file"
              >
                <Upload className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Upload File</span>
              </Button>
            </div>

            {uploadProgress && (
              <div className="text-[11px] text-amber-900 font-medium flex items-center gap-1.5 pt-0.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                <span>{uploadProgress}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Standard Full Panel Mode ──
  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        hasSignedBol ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'
      } ${className}`}
    >
      {sharedInputs}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              Proof of Delivery (POD) Documentation
            </span>
            {hasSignedBol ? (
              <Badge className="bg-emerald-600 text-white font-semibold text-[10px]">
                Signed BOL Verified • Ready for Invoicing
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-[10px]">
                Pending Paperwork (Required for Billing)
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {hasSignedBol
              ? 'Signed Bill of Lading is stored and ready for customer billing and driver settlement.'
              : 'Take a photo or choose a PDF/image of the signed physical BOL / POD to close out paperwork.'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {hasSignedBol ? (
            <>
              <a
                href={resolvedBolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>View Signed BOL</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTriggerFilePicker}
                disabled={isUploading}
                className="border-slate-300 hover:bg-slate-100 text-slate-700 text-xs flex items-center gap-1"
                title="Upload a new photo or PDF to replace current document"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Replace</span>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                onClick={handleTriggerFilePicker}
                disabled={isUploading}
                className="flex-1 sm:w-auto min-h-[42px] py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading…</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>{label || 'Upload Signed BOL / POD'}</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTriggerCamera}
                disabled={isUploading}
                className="min-h-[42px] px-3 border-amber-400 bg-white hover:bg-amber-100 text-amber-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                title="Take photo with camera"
              >
                <Camera className="w-4 h-4 text-amber-700" />
                <span>Camera</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {uploadProgress && (
        <div className="mt-2.5 text-xs text-amber-800 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
          <span>{uploadProgress}</span>
        </div>
      )}
    </div>
  );
}
