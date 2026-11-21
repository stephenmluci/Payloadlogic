'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { AppNotification } from '@/types';
import {
  subscribeToDriverNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/lib/notifications';
import { registerServiceWorker, subscribeUserToPush } from '@/lib/webPushClient';
import { useApp } from '@/context/AppContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, Check, CheckCheck, Clock, ExternalLink, Inbox, Package, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface NotificationBellProps {
  driverId: string;
  /** Optional additional candidate IDs (e.g. authUid) to include in the subscription. */
  driverIds?: string[];
  onSelectLoad?: (loadId: string) => void;
}

export function NotificationBell({ driverId, driverIds, onSelectLoad }: NotificationBellProps) {
  const { updateDriverProfile } = useApp();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);

  const subscriptionKey = useMemo(() => {
    const all = [driverId, ...(driverIds || [])]
      .map((id) => (id || '').trim())
      .filter((id) => Boolean(id) && id !== 'none');
    return Array.from(new Set(all)).join('|');
  }, [driverId, driverIds]);

  useEffect(() => {
    registerServiceWorker();

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setPushStatus('granted');
      } else if (Notification.permission === 'denied') {
        setPushStatus('denied');
      } else {
        setPushStatus('prompt');
      }
    } else {
      setPushStatus('unsupported');
    }
  }, []);

  const handleEnablePush = async () => {
    setIsSubscribingPush(true);
    try {
      const sub = await subscribeUserToPush();
      if (sub) {
        setPushStatus('granted');
        const subJson = sub.toJSON();
        await updateDriverProfile(driverId, {
          webPushSubscription: subJson,
        });
      } else if (typeof window !== 'undefined' && 'Notification' in window) {
        setPushStatus(Notification.permission as any);
      }
    } catch (err) {
      console.warn('Error enabling web push:', err);
    } finally {
      setIsSubscribingPush(false);
    }
  };

  useEffect(() => {
    if (!subscriptionKey) {
      setNotifications([]);
      return;
    }

    const ids = subscriptionKey.split('|');
    const unsubscribe = subscribeToDriverNotifications(ids, (items) => {
      setNotifications(items);
    });

    return () => unsubscribe();
  }, [subscriptionKey]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markLocalAsRead = (idsToMark: string[]) => {
    const idSet = new Set(idsToMark);
    setNotifications((prev) =>
      prev.map((n) => (idSet.has(n.id) ? { ...n, isRead: true } : n))
    );
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.isRead) {
      markLocalAsRead([notif.id]);
      await markNotificationAsRead(notif.id).catch((err) =>
        console.warn('Failed to mark notification as read:', err)
      );
    }

    if (notif.loadId && onSelectLoad) {
      onSelectLoad(notif.loadId);
    } else if (notif.actionUrl && typeof window !== 'undefined') {
      window.location.href = notif.actionUrl;
    }
    setIsOpen(false);
  };

  const handleMarkSingleRead = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    markLocalAsRead([notifId]);
    await markNotificationAsRead(notifId).catch((err) =>
      console.warn('Failed to mark notification as read:', err)
    );
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;
    markLocalAsRead(unreadIds);
    await markAllNotificationsAsRead(unreadIds);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Driver Notifications"
          aria-expanded={isOpen}
          className="relative p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all border border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-extrabold text-white ring-2 ring-slate-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(92vw,380px)] p-0 rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden z-[200]"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-amber-400 shrink-0" />
            <h4 className="text-sm font-bold tracking-tight text-white">Notifications</h4>
            {unreadCount > 0 ? (
              <Badge className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] px-1.5 py-0">
                {unreadCount} unread
              </Badge>
            ) : (
              <Badge variant="outline" className="text-slate-400 border-slate-700 text-[10px] px-1.5 py-0">
                All caught up
              </Badge>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Clear / Mark read</span>
            </button>
          )}
        </div>

        {/* Enable Phone Lock-screen Push Banner */}
        {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-800 text-[11px]">
              <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Get lock-screen alerts when phone is locked</span>
            </div>
            <button
              type="button"
              disabled={isSubscribingPush}
              onClick={handleEnablePush}
              className="px-2.5 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-all shrink-0 disabled:opacity-50"
            >
              {isSubscribingPush ? 'Enabling...' : 'Enable'}
            </button>
          </div>
        )}

        {/* Notification List */}
        <div className="max-h-[min(60vh,380px)] overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/50">
              <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">No new notifications</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Load assignments, status updates, and dispatch notes will appear here.
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const formattedDate = notif.createdAt
                ? new Date(notif.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                    month: 'short',
                    day: 'numeric',
                  })
                : '';

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                    notif.isRead
                      ? 'bg-white hover:bg-slate-50/80 opacity-75'
                      : 'bg-amber-50/40 hover:bg-amber-50/80 border-l-4 border-l-amber-500'
                  }`}
                >
                  <div
                    className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                      notif.isRead
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-amber-500 text-slate-950 font-bold'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p
                        className={`text-xs truncate ${
                          notif.isRead
                            ? 'font-semibold text-slate-700'
                            : 'font-bold text-slate-900'
                        }`}
                      >
                        {notif.title || 'Dispatch Notification'}
                      </p>
                      {!notif.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkSingleRead(e, notif.id)}
                          title="Mark as read"
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
                        >
                          <Check className="w-2.5 h-2.5" />
                          Read
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 leading-snug line-clamp-2">
                      {notif.message}
                    </p>

                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formattedDate}
                      </span>
                      {notif.loadId && (
                        <span className="text-blue-600 font-semibold flex items-center gap-0.5 hover:underline">
                          View Load <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
