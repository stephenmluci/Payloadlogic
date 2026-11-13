'use client';

import React, { useRef, useState } from 'react';
import { Camera, Upload, FileText, CheckCircle2, Loader2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { uploadSignedBolDocument } from '@/lib/storage';
import type { Load } from '@/types';

interface SignedBolUploadProps {
  load: Load;
  onUploadSuccess?: (downloadUrl: string) => void;
  updateLoad?: (id: string, updates: Partial<Load>) => Promise<void>;
  compact?: boolean;
  className?: string;
  label?: string;
}

export function SignedBolUpload({
  load,
  onUploadSuccess,
  updateLoad,
  compact = false,
  className = '',
  label,
}: SignedBolUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const handleTriggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !load.id) return;

    // Validate size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Please select a signed document under 25MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress('Uploading signed document to Cloud Storage…');

    try {
      const downloadUrl = await uploadSignedBolDocument(load.id, file, file.name);
      const uploadedAt = new Date().toISOString();

      if (updateLoad) {
        await updateLoad(load.id, {
          signedBolUrl: downloadUrl,
          signedBolUploadedAt: uploadedAt,
          paperworkStatus: 'pod_uploaded',
        });
      }

      if (onUploadSuccess) {
        onUploadSuccess(downloadUrl);
      }

      toast({
        title: 'Signed BOL / POD Uploaded',
        description: 'Signed document has been recorded. Load is now ready for accounting & customer invoicing.',
      });
    } catch (err: any) {
      console.error('Failed to upload signed BOL:', err);
      toast({
        title: 'Upload Failed',
        description: err.message || 'Could not complete upload. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const hasSignedBol = Boolean(load.signedBolUrl);

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={handleFileSelected}
          className="hidden"
          aria-label="Upload Signed BOL / POD"
        />

        {hasSignedBol ? (
          <div className="flex items-center gap-1.5">
            <a
              href={load.signedBolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-xs font-semibold transition-colors"
              title="View Signed BOL document"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              <span>Signed BOL Attached</span>
              <ExternalLink className="w-3 h-3 text-teal-500" />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleTriggerUpload}
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
            onClick={handleTriggerUpload}
            disabled={isUploading}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs h-8 flex items-center gap-1.5 shadow-sm"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading…</span>
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                <span>Upload Signed BOL / POD</span>
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      hasSignedBol 
        ? 'bg-emerald-50/70 border-emerald-200' 
        : 'bg-amber-50/70 border-amber-200'
    } ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
        aria-label="Upload Signed BOL / POD"
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
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
              ? `Signed Bill of Lading is stored in Cloud Storage. Ready for customer billing and driver settlement.`
              : `Delivery drop-off is verified. Upload signed physical paper BOL (photo or PDF) to close out paperwork for accounting & invoicing.`}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {hasSignedBol ? (
            <>
              <a
                href={load.signedBolUrl}
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
                onClick={handleTriggerUpload}
                disabled={isUploading}
                className="border-slate-300 hover:bg-slate-100 text-slate-700 text-xs flex items-center gap-1"
                title="Upload a new photo or PDF to replace current document"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Replace</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={handleTriggerUpload}
              disabled={isUploading}
              className="w-full sm:w-auto py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading to Cloud Storage…</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>{label || 'Upload Signed BOL / POD'}</span>
                </>
              )}
            </Button>
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
