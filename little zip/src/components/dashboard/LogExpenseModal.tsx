'use client';

import React, { useState, useRef } from 'react';
import type { Load, ActualExpenseCategory } from '@/types';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { uploadReceiptImage } from '@/lib/storage';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Camera,
  Upload,
  Receipt,
  Fuel,
  Wrench,
  DollarSign,
  FileText,
  Loader2,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface LogExpenseModalProps {
  /** Optional: omit for downtime expenses that are not tied to a load. */
  load?: Load | null;
  /** Driver, truck and trailer are always attached to the expense. */
  driverId?: string;
  truckId?: string | null;
  trailerId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: { value: ActualExpenseCategory; label: string; icon: string; description: string }[] = [
  { value: 'Fuel', label: 'Fuel (Diesel)', icon: '⛽', description: 'Diesel fuel purchase (requires gallons for IFTA)' },
  { value: 'DEF', label: 'DEF', icon: '💧', description: 'DEF fluid purchase' },
  { value: 'Maintenance/Repair', label: 'Maintenance/Repair', icon: '🔧', description: 'Repairs and service' },
  { value: 'Parts', label: 'Parts', icon: '⚙️', description: 'Truck & trailer parts and equipment' },
  { value: 'Tow/Recovery', label: 'Tow/Recovery', icon: '🛞', description: 'Emergency roadside towing and recovery' },
  { value: 'Scale Ticket', label: 'Scale Ticket', icon: '⚖️', description: 'Certified axle/gross weight scale receipt' },
  { value: 'Other', label: 'Other', icon: '📦', description: 'Custom or miscellaneous operational expense' },
];

export function LogExpenseModal({ load, driverId, truckId, trailerId, isOpen, onClose }: LogExpenseModalProps) {
  const { addActualExpense, user } = useApp();
  const { toast } = useToast();

  const [category, setCategory] = useState<ActualExpenseCategory>('Fuel');
  const [customExpenseType, setCustomExpenseType] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [gallonsPurchased, setGallonsPurchased] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string>('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFuel = category === 'Fuel';

  const resetForm = () => {
    setCategory('Fuel');
    setCustomExpenseType('');
    setAmount('');
    setGallonsPurchased('');
    setNotes('');
    setReceiptFile(null);
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setIsUploading(false);
    setUploadProgressMsg('');
  };

  const handleClose = () => {
    if (isUploading) return;
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 15MB
    if (file.size > 15 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File Too Large',
        description: 'Receipt image size must be under 15MB.',
      });
      return;
    }

    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const clearSelectedFile = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setReceiptFile(null);
    setPreviewUrl(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Amount',
        description: 'Please enter a valid expense amount greater than $0.00.',
      });
      return;
    }

    if (category === 'Other' && !customExpenseType.trim()) {
      toast({
        variant: 'destructive',
        title: 'Expense Type Required',
        description: 'Please specify the expense type for the "Other" category.',
      });
      return;
    }

    if (isFuel && gallonsPurchased.trim()) {
      const numericGallons = parseFloat(gallonsPurchased);
      if (isNaN(numericGallons) || numericGallons <= 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid Gallons',
          description: 'Please enter a valid number of gallons purchased for IFTA reporting.',
        });
        return;
      }
    }

    // Ensure actual File object exists in state (not a preview string)
    if (!receiptFile || !(receiptFile instanceof File)) {
      toast({
        variant: 'destructive',
        title: 'Receipt File Required',
        description: 'Please capture a photo or choose an image file for this receipt.',
      });
      return;
    }

    const resolvedDriverId = driverId || user?.uid;
    if (!resolvedDriverId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Driver identifier is missing.',
      });
      return;
    }

    // Step 1: Prevent Default & set isSubmitting(true)
    setIsUploading(true);
    setUploadProgressMsg('Uploading receipt image to Firebase Storage...');

    const loadId = load?.id ?? null;
    const entityPath = loadId ?? `downtime-${resolvedDriverId}`;

    try {
      // Step 2 & 3: Upload First & Retrieve URL (uses local disk upload route; 100% free)
      const uploadedUrl = await uploadReceiptImage(entityPath, receiptFile);

      if (!uploadedUrl) {
        throw new Error('Failed to save receipt image.');
      }

      setUploadProgressMsg('Recording expense in financial ledger...');

      // Step 4: Database Write Second with uploadedUrl (NEVER the local preview)
      const parsedGallons = isFuel && gallonsPurchased.trim()
        ? parseFloat(gallonsPurchased)
        : undefined;

      const fullNotes = category === 'Other' && customExpenseType.trim()
        ? (notes.trim() ? `[${customExpenseType.trim()}] ${notes.trim()}` : `[${customExpenseType.trim()}]`)
        : (notes.trim() || undefined);

      await addActualExpense(loadId, {
        loadId,
        driverId: resolvedDriverId,
        truckId: truckId ?? null,
        trailerId: trailerId ?? null,
        category,
        amount: numericAmount,
        gallonsPurchased: parsedGallons,
        notes: fullNotes,
        receiptUrl: uploadedUrl, // Specifically the uploaded HTTPS URL
        receiptUploadedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      toast({
        title: 'Receipt Logged Successfully',
        description: load
          ? `$${numericAmount.toFixed(2)} (${category}) saved to Load #${load.loadNumber || load.id?.slice(0, 8)}.`
          : `$${numericAmount.toFixed(2)} (${category}) saved as a non-load expense.`,
      });

      // Step 5: Clean Up & set isSubmitting(false)
      handleClose();
    } catch (err: any) {
      console.error('Failed to log expense:', err);
      setIsUploading(false);
      setUploadProgressMsg('');
      const errorMsg = err?.message || 'Could not record expense. Please try again.';
      alert(`Firebase Storage/Database Error: ${errorMsg}`);
      toast({
        variant: 'destructive',
        title: 'Expense Logging Failed',
        description: errorMsg,
      });
    } finally {
      setIsUploading(false);
      setUploadProgressMsg('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-md w-full sm:max-w-lg p-0 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl my-auto animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {load ? 'Log In-Transit Expense' : 'Log Fuel / Expense'}
                </h3>
                <p className="text-xs text-slate-300">
                  {load
                    ? `Load #${load.loadNumber || load.id?.substring(0, 8)} • ${load.origin.city} → ${load.destination.city}`
                    : 'Downtime expense • not tied to a load'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber-400/50 bg-amber-400/10 text-amber-300 text-xs">
                Driver Route Cost
              </Badge>
              <button
                type="button"
                onClick={handleClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                disabled={isUploading}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Expense Category */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                Expense Category <span className="text-red-500">*</span>
              </Label>
              <span className="text-[11px] font-semibold text-slate-500">
                {CATEGORIES.find((c) => c.value === category)?.label || category}
              </span>
            </div>

            {/* Selectable UI Chips for fast driver access */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      setCategory(cat.value);
                      if (cat.value !== 'Other') {
                        setCustomExpenseType('');
                      }
                    }}
                    disabled={isUploading}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 text-amber-950 font-bold ring-2 ring-amber-500/20 shadow-sm'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300 text-slate-700 font-medium'
                    }`}
                  >
                    <span className="text-base shrink-0">{cat.icon}</span>
                    <span className="text-xs truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom 'Other' Field: dynamically rendered when 'Other' category is chosen */}
          {category === 'Other' && (
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-100/90 border border-slate-300 animate-in fade-in-50 duration-150">
              <Label htmlFor="custom-expense-type" className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                Specify Expense Type <span className="text-red-500">*</span>
              </Label>
              <Input
                id="custom-expense-type"
                type="text"
                placeholder="e.g. Parking fee, Permit, DEF nozzle adapter, Lodging"
                value={customExpenseType}
                onChange={(e) => setCustomExpenseType(e.target.value)}
                required
                disabled={isUploading}
                className="h-10 text-sm font-medium text-slate-900 rounded-lg border-slate-300 bg-white"
              />
              <p className="text-[11px] text-slate-600">
                Please describe what this receipt covers for accounting records.
              </p>
            </div>
          )}

          {/* Amount Incurred */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              Amount Incurred ($) <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-base">
                $
              </span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={isUploading}
                className="pl-8 h-11 text-base font-bold text-slate-900 rounded-xl border-slate-300 bg-slate-50/60 focus:bg-white"
              />
            </div>
          </div>

          {/* Gallons Purchased (Conditional: ONLY for Fuel (Diesel)) */}
          {isFuel && (
            <div className="space-y-1.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 animate-in fade-in-50 duration-150">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-amber-600" />
                  Gallons Purchased (IFTA Tracking)
                </Label>
                <Badge className="bg-amber-200 text-amber-900 text-[10px] font-bold">
                  IFTA Required
                </Badge>
              </div>
              <Input
                type="number"
                step="0.001"
                min="0.01"
                placeholder="e.g. 45.250"
                value={gallonsPurchased}
                onChange={(e) => setGallonsPurchased(e.target.value)}
                disabled={isUploading}
                className="h-10 text-sm font-semibold text-amber-950 rounded-lg border-amber-300 bg-white"
              />
              <p className="text-[11px] text-amber-800 leading-tight">
                Used to calculate quarterly fuel tax credits and route efficiency (MPG).
              </p>
            </div>
          )}

          {/* Notes / Description */}
          <div className="space-y-1.5">
            <Label htmlFor="expense-notes" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Notes / Description (Optional)
            </Label>
            <Textarea
              id="expense-notes"
              name="notes"
              rows={3}
              placeholder="e.g. Pilot Flying J #424, I-80 Exit 112 • Front right trailer tire plug"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isUploading}
              className="text-sm font-normal text-slate-900 placeholder:text-slate-400 rounded-xl border border-slate-300 bg-white focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Receipt Upload (Camera capture or file upload) */}
          <div className="space-y-2 pt-1">
            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Receipt Upload <span className="text-red-500">*</span></span>
              <span className="text-[10px] font-normal text-slate-500">Camera / Photo or PDF</span>
            </Label>

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading}
            />

            {!receiptFile ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isUploading}
                  className="h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-dashed border-2 border-blue-300 bg-blue-50/50 hover:bg-blue-100 text-blue-700 font-semibold"
                >
                  <Camera className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-bold">Take Photo</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-dashed border-2 border-slate-300 bg-slate-50/80 hover:bg-slate-100 text-slate-700 font-semibold"
                >
                  <Upload className="w-5 h-5 text-slate-500" />
                  <span className="text-xs font-bold">Choose File</span>
                </Button>
              </div>
            ) : (
              <div className="relative rounded-xl border border-emerald-300 bg-emerald-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-emerald-900 truncate">
                      {receiptFile.name}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      ({(receiptFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    disabled={isUploading}
                    className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Remove receipt"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {previewUrl && (
                  <div className="relative max-h-40 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Receipt Preview"
                      className="w-full h-auto max-h-40 object-contain mx-auto"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upload Progress Status */}
          {isUploading && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-800">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>{uploadProgressMsg || 'Saving expense...'}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
              className="h-10 rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isUploading || !amount || !receiptFile || (category === 'Other' && !customExpenseType.trim())}
              className="h-10 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center justify-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                <>
                  <Receipt className="w-3.5 h-3.5 mr-1" />
                  Submit Actual Expense
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
