'use client';

import React, { useState, useEffect } from 'react';
import { format, isValid } from 'date-fns';
import { CalendarIcon, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimePickerSelect } from './TimePickerSelect';

interface DispatcherDateTimePickerProps {
  value: string; // ISO string or "YYYY-MM-DDTHH:mm"
  onChange: (val: string) => void;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
}

export function DispatcherDateTimePicker({
  value,
  onChange,
  id,
  className,
  disabled = false,
}: DispatcherDateTimePickerProps) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time24, setTime24] = useState<string>('08:00');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (isValid(d)) {
        setDate(d);
        setTime24(format(d, 'HH:mm'));
      }
    } else {
      setDate(undefined);
      setTime24('08:00');
    }
  }, [value]);

  const notifyChange = (selectedDate: Date | undefined, timeStr24h: string) => {
    const targetDate = selectedDate || new Date();
    const newD = new Date(targetDate);

    let h = 8;
    let m = 0;
    if (timeStr24h) {
      const match = timeStr24h.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        h = parseInt(match[1], 10);
        m = parseInt(match[2], 10);
      }
    }

    newD.setHours(h, m, 0, 0);
    onChange(format(newD, "yyyy-MM-dd'T'HH:mm"));
  };

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      notifyChange(selectedDate, time24 || '08:00');
    }
  };

  const handleTimeSelect = (newTime24: string) => {
    setTime24(newTime24);
    notifyChange(date, newTime24);
  };

  const applyPreset = (timePreset: string) => {
    let t = timePreset;
    if (t === 'now') {
      t = format(new Date(), 'HH:mm');
    }
    setTime24(t);
    notifyChange(date || new Date(), t);
    setIsOpen(false);
  };

  return (
    <div className={cn("flex flex-wrap sm:flex-nowrap gap-2 w-full items-center", className)} id={id}>
      {/* Date Picker Trigger with Calendar Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "flex-1 min-w-[140px] justify-start text-left font-normal bg-white h-10 px-3 border-input shadow-sm hover:border-slate-300 transition-colors",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-blue-600 shrink-0" />
            <span className="truncate">{date ? format(date, 'MMM d, yyyy') : "Pick Date"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 flex flex-col sm:flex-row z-[99999] bg-white border border-slate-200 shadow-2xl rounded-xl overflow-hidden" align="start">
          <div className="p-3 border-b sm:border-b-0 sm:border-r border-slate-200">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              initialFocus
            />
          </div>
          {/* Retained Quick Time Presets Sidebar inside Popover */}
          <div className="p-3 flex flex-col gap-2 min-w-[170px] bg-slate-50">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>Quick Presets</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start bg-white text-xs h-8 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-medium"
                onClick={() => applyPreset('now')}
              >
                ⚡ Now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start bg-white text-xs h-8 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-medium"
                onClick={() => applyPreset('08:00')}
              >
                🌅 08:00 AM (Morning)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start bg-white text-xs h-8 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-medium"
                onClick={() => applyPreset('12:00')}
              >
                ☀️ 12:00 PM (Noon)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start bg-white text-xs h-8 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-medium"
                onClick={() => applyPreset('17:00')}
              >
                🌇 05:00 PM (Close)
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Unified 30-Minute Scrollable Time Dropdown */}
      <div className="w-full sm:w-44 flex-shrink-0">
        <TimePickerSelect
          value={time24}
          onChange={handleTimeSelect}
          disabled={disabled}
          placeholder="Select time"
        />
      </div>
    </div>
  );
}
