'use client';

import React, { useState, useEffect } from 'react';
import type { Load, Client, Settings, DriverProfile, Vehicle } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Mail,
  Download,
  Share2,
  Copy,
  CheckCircle2,
  FileCheck,
  FileText,
  Loader2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  compileLoadPacketPdf,
  downloadLoadPacketPdf,
  getLoadPacketEmailInfo,
  getLoadPacketRecipientEmail,
} from '@/lib/loadPacket';

interface ShareLoadPacketModalProps {
  load: Load | null;
  client?: Client;
  settings: Settings;
  driver?: DriverProfile;
  truck?: Vehicle;
  trailer?: Vehicle;
  vehicles?: Vehicle[];
  driverProfiles?: DriverProfile[];
  isOpen: boolean;
  onClose: () => void;
}

export function ShareLoadPacketModal({
  load,
  client,
  settings,
  driver,
  truck,
  trailer,
  vehicles,
  driverProfiles,
  isOpen,
  onClose,
}: ShareLoadPacketModalProps) {
  const { toast } = useToast();

  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [compiledBlob, setCompiledBlob] = useState<Blob | null>(null);
  const [compiledFileName, setCompiledFileName] = useState('');
  const [copied, setCopied] = useState(false);

  const resolvedDriver = driver || (load?.assignedDriverId && driverProfiles ? driverProfiles.find(d => d.uid === load.assignedDriverId) : undefined);
  const resolvedTruck = truck || (load?.assignedTruckId && vehicles ? vehicles.find(v => v.id === load.assignedTruckId) : undefined);
  const resolvedTrailer = trailer || (load?.assignedTrailerId && vehicles ? vehicles.find(v => v.id === load.assignedTrailerId) : undefined);

  const isDelivered = load?.status === 'delivered';
  const hasBol = Boolean(load?.signedBolUrl);
  const isReadyForPacket = isDelivered && hasBol;

  // Sync state whenever load changes or modal opens
  useEffect(() => {
    if (isOpen && load) {
      const emailInfo = getLoadPacketEmailInfo({ load, client, settings });
      setToEmail(emailInfo.to);
      setSubject(emailInfo.subject);
      setBody(emailInfo.body);
      setCompiledBlob(null);
      setCompiledFileName('');
      setCopied(false);

      // Only precompile PDF if load is completed / delivered with signed BOL
      if (isReadyForPacket) {
        setIsCompiling(true);
        compileLoadPacketPdf({ load, client, settings, driver: resolvedDriver, truck: resolvedTruck, trailer: resolvedTrailer })
          .then((res) => {
            setCompiledBlob(res.pdfBlob);
            setCompiledFileName(res.fileName);
          })
          .catch((err) => {
            console.warn('Packet precompile error:', err);
          })
          .finally(() => {
            setIsCompiling(false);
          });
      }
    }
  }, [isOpen, load, client, settings, driver, truck, trailer, isReadyForPacket]);

  if (!load) return null;

  const loadNumber = load.loadNumber || load.id?.substring(0, 8) || 'N/A';
  const bolTypeLabel = load.bolSource === 'system'
    ? 'System Generated (Internal Sign-on-Glass)'
    : 'Broker Provided (Physical Paper BOL)';

  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const checkPreFlightGate = (): boolean => {
    if (!isDelivered || !hasBol) {
      toast({
        title: 'Action Denied',
        description: 'Action Denied: The load packet cannot be generated until the load is marked as Delivered and the BOL is signed.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleDownload = async () => {
    if (!checkPreFlightGate()) return;

    try {
      setIsDownloading(true);
      if (compiledBlob && compiledFileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(compiledBlob);
        link.download = compiledFileName;
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        await downloadLoadPacketPdf({ load, client, settings, driver, truck, trailer });
      }
      toast({
        title: 'Packet Downloaded',
        description: `Unified load packet PDF saved to your device.`,
      });
    } catch (err: any) {
      toast({
        title: 'Download Failed',
        description: err?.message || 'Could not compile packet PDF.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleTriggerEmail = async () => {
    if (!checkPreFlightGate()) return;

    const target = toEmail.trim();
    if (!target) {
      toast({
        title: 'Email Address Required',
        description: 'Please enter a recipient email address for the broker or customer.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSendingEmail(true);

      // Ensure we have the compiled PDF
      let pdfBase64 = '';
      let fileName = compiledFileName || `Load_Packet_${load.loadNumber || load.id?.substring(0, 8) || 'load'}.pdf`;

      if (compiledBlob) {
        const buffer = await compiledBlob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
      } else {
        const compiled = await compileLoadPacketPdf({
          load,
          client,
          settings,
          driver: resolvedDriver,
          truck: resolvedTruck,
          trailer: resolvedTrailer,
        });
        fileName = compiled.fileName;
        const bytes = compiled.pdfBytes;
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
      }

      const response = await fetch('/api/send-load-packet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: target,
          subject,
          body,
          pdfBase64,
          fileName,
          loadNumber: load.loadNumber || load.id?.substring(0, 8) || 'N/A',
          carrierName: settings.carrierName || 'PayloadLogic Fleet',
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to dispatch email.');
      }

      toast({
        title: 'Load Packet Dispatched',
        description: `Successfully emailed Load Packet (Invoice + BOL) to ${target}.`,
      });
    } catch (err: any) {
      console.error('Failed to send load packet email:', err);
      toast({
        title: 'Email Dispatch Failed',
        description: err?.message || 'Unable to send email. Please verify network or SMTP settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCopy = async () => {
    try {
      const copyPayload = `${subject}\n\nTo: ${toEmail}\n\n${body}`;
      await navigator.clipboard.writeText(copyPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({
        title: 'Email Text Copied',
        description: 'Subject, recipient, and message body copied to clipboard.',
      });
    } catch {
      toast({
        title: 'Copy Failed',
        description: 'Unable to access clipboard.',
        variant: 'destructive',
      });
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      handleTriggerEmail();
      return;
    }

    try {
      let fileToShare: File | null = null;
      if (compiledBlob && compiledFileName) {
        fileToShare = new File([compiledBlob], compiledFileName, { type: 'application/pdf' });
      }

      if (fileToShare && navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
        await navigator.share({
          title: subject,
          text: body,
          files: [fileToShare],
        });
      } else {
        await navigator.share({
          title: subject,
          text: body,
          url: load.signedBolUrl || undefined,
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Native share failed:', err);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="p-5 pb-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Share2 className="w-5 h-5 text-indigo-400" />
              Share / Email Load Billing Packet
            </DialogTitle>
            <Badge className="bg-indigo-500/30 text-indigo-200 border-indigo-400/40 text-xs">
              Load #{loadNumber}
            </Badge>
          </div>
          <DialogDescription className="text-slate-300 text-xs mt-1">
            Universal document packet: automatically compiles the Financial Freight Invoice and the signed Bill of Lading (BOL / POD) into a unified PDF ready for client billing.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-sm">
          {/* Incomplete load warning banner */}
          {!isReadyForPacket && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-amber-900 block">Load Packet Generation Gated</span>
                <span className="text-amber-800 mt-0.5 block leading-relaxed">
                  The load packet cannot be generated or emailed until the load is marked as <strong>Delivered</strong> and the <strong>BOL is signed</strong>. Current status: <span className="font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">{load.status}</span>.
                </span>
              </div>
            </div>
          )}

          {/* Document Compilation Status Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" /> Compiled Document Manifest
              </span>
              {isCompiling ? (
                <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> Compiling PDF…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" /> PDF Ready
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Page 1: Invoice */}
              <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-[11px]">
                    1
                  </span>
                  <div>
                    <span className="font-semibold text-slate-800 block">Freight Billing Invoice</span>
                    <span className="text-[11px] text-slate-500">${load.totalAgreedRate.toFixed(2)} Total Due</span>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                  Included
                </Badge>
              </div>

              {/* Page 2: BOL */}
              <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                    2
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 block truncate">Signed BOL / POD</span>
                    <span className="text-[10px] text-slate-500 block truncate" title={bolTypeLabel}>
                      {load.bolSource === 'system' ? '⚡ System Digital BOL' : '📄 Broker Paper BOL'}
                    </span>
                  </div>
                </div>
                {hasBol ? (
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-[10px] shrink-0">
                    Attached
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] shrink-0">
                    Pending BOL
                  </Badge>
                )}
              </div>
            </div>

            {hasBol && load.signedBolUrl && (
              <div className="pt-1 flex items-center justify-between text-[11px] text-slate-600">
                <span className="truncate">Document Storage URI: {load.signedBolUrl.substring(0, 45)}…</span>
                <a
                  href={load.signedBolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-800 font-semibold inline-flex items-center gap-0.5 ml-2"
                >
                  Inspect BOL <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {/* Email Recipient Input */}
          <div className="space-y-1.5">
            <Label htmlFor="toEmail" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Broker / Customer Email Address *</span>
              {client?.contactEmail && (
                <span className="text-[11px] text-blue-600 font-normal">
                  Bound from Client Profile ({client.companyName})
                </span>
              )}
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="toEmail"
                type="email"
                placeholder="broker@logistics.com, accounting@client.com"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                className="pl-9 text-sm bg-white border-slate-300"
              />
            </div>
          </div>

          {/* Subject Line Input */}
          <div className="space-y-1.5">
            <Label htmlFor="subject" className="text-xs font-semibold text-slate-700">
              Email Subject Line
            </Label>
            <Input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-sm bg-white border-slate-300"
            />
          </div>

          {/* Email Body Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="emailBody" className="text-xs font-semibold text-slate-700">
                Email Message Text
              </Label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy Email Text'}
              </button>
            </div>
            <Textarea
              id="emailBody"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="text-xs font-mono resize-none bg-white border-slate-300 leading-relaxed"
            />
          </div>
        </div>

        <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={isDownloading || isCompiling || !isReadyForPacket}
            title={!isReadyForPacket ? 'Load must be marked as Delivered and BOL signed' : 'Download Load Packet'}
            className="text-xs h-9 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
            )}
            Download Unified PDF
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-9"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleTriggerEmail}
              disabled={isSendingEmail || !isReadyForPacket}
              title={!isReadyForPacket ? 'Load must be marked as Delivered and BOL signed' : 'Send Load Packet Email'}
              className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending Load Packet…
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                  Send / Email Load Packet
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
