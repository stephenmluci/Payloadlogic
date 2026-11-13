'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Download, FileText, X } from 'lucide-react';

interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptUrl: string | null;
  expenseTitle?: string;
  category?: string;
  amount?: number;
  driverName?: string;
  date?: string;
}

export function ReceiptViewerModal({
  isOpen,
  onClose,
  receiptUrl,
  expenseTitle,
  category,
  amount,
  driverName,
  date,
}: ReceiptViewerModalProps) {
  if (!isOpen || !receiptUrl) return null;

  const isPdf = receiptUrl.includes('.pdf') || receiptUrl.startsWith('data:application/pdf');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] p-0 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 bg-slate-900 text-white flex flex-row items-center justify-between space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base sm:text-lg font-bold text-white">
                Receipt Verification
              </DialogTitle>
              {category && (
                <Badge variant="secondary" className="bg-amber-400 text-slate-950 font-semibold text-xs">
                  {category}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {driverName ? `Logged by ${driverName}` : 'Driver receipt submission'}
              {date ? ` • ${new Date(date).toLocaleDateString()}` : ''}
              {amount !== undefined ? ` • $${amount.toFixed(2)}` : ''}
            </p>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-6 bg-slate-50 flex flex-col items-center justify-center min-h-[300px] max-h-[70vh] overflow-y-auto">
          {isPdf ? (
            <div className="w-full h-[60vh] flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 p-6 text-center shadow-inner">
              <FileText className="w-16 h-16 text-blue-600 mb-3" />
              <p className="text-sm font-semibold text-slate-800 mb-1">PDF Document Receipt</p>
              <p className="text-xs text-slate-500 mb-4 max-w-sm">
                This receipt was uploaded as a PDF file. You can open it in a new browser tab or download it directly.
              </p>
              <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  Open PDF Receipt
                </a>
              </Button>
            </div>
          ) : (
            <div className="relative w-full max-h-[60vh] flex items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptUrl}
                alt={expenseTitle || 'Receipt'}
                className="max-h-[58vh] max-w-full w-auto object-contain rounded-lg shadow-sm"
              />
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="text-xs font-semibold text-slate-700"
          >
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer" download="receipt">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Open Original
            </a>
          </Button>

          <Button
            type="button"
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-5 h-9 rounded-xl"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
