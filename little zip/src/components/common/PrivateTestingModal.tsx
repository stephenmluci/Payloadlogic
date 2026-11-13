'use client';

import React from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert, KeyRound, ArrowRight } from 'lucide-react';
import { ALLOWED_OWNER_EMAIL, PRIVATE_TESTING_RESTRICTION_MESSAGE } from '@/lib/authConfig';

interface PrivateTestingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function PrivateTestingModal({
  open,
  onOpenChange,
  title = 'Private Testing Access Only',
}: PrivateTestingModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#111d2e] border-white/10 text-white rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="space-y-3 text-center sm:text-left">
          <div className="mx-auto sm:mx-0 w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold text-white tracking-tight">
              {title}
            </DialogTitle>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-semibold">
              Owner Testing Mode
            </div>
          </div>
          <DialogDescription className="text-sm font-medium text-amber-200/90 leading-relaxed pt-2">
            {PRIVATE_TESTING_RESTRICTION_MESSAGE}
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-300 space-y-2">
          <p>
            Public sign-ups, free trials, and self-registration are currently paused while PayloadLogic is in private owner-testing mode.
          </p>
          <p className="text-slate-400">
            If you are the platform owner (<span className="text-[#ffbe24] font-medium">{ALLOWED_OWNER_EMAIL}</span>), please sign in below with your owner credentials.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          >
            Continue Browsing
          </Button>
          <Button
            asChild
            className="w-full sm:w-auto bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] font-bold shadow-lg shadow-[#ffbe24]/20"
          >
            <Link href="/login" onClick={() => onOpenChange(false)}>
              <KeyRound className="h-4 w-4 mr-1.5" />
              Owner Sign In
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
