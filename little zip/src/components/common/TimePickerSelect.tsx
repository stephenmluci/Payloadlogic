'use client';

import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface TimePickerSelectProps {
  value?: string; // 24-hour time string "HH:mm" (e.g. "08:00", "13:30")
  onChange: (time24h: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

// Generate the 48 standard 30-minute intervals across the 24-hour day
export const STANDARD_TIME_INTERVALS = Array.from({ length: 48 }, (_, i) => {
  const totalMinutes = i * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const value = `${hh}:${mm}`;

  const period = hours < 12 ? 'AM' : 'PM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const label = `${displayHours.toString().padStart(2, '0')}:${mm} ${period}`;

  return { value, label };
});

export function format24HourTo12Hour(time24: string): string {
  if (!time24) return '';
  const match = time24.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time24;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const period = h < 12 ? 'AM' : 'PM';
  const displayHours = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHours.toString().padStart(2, '0')}:${m} ${period}`;
}

export function TimePickerSelect({
  value,
  onChange,
  disabled = false,
  className,
  placeholder = 'Select time',
}: TimePickerSelectProps) {
  // Normalize value to "HH:mm"
  const normalizedValue = useMemo(() => {
    if (!value) return '';
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return value;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }, [value]);

  // Combine standard 30-min options with any custom/exact off-interval time
  const options = useMemo(() => {
    if (!normalizedValue) return STANDARD_TIME_INTERVALS;

    const exists = STANDARD_TIME_INTERVALS.some(opt => opt.value === normalizedValue);
    if (exists) return STANDARD_TIME_INTERVALS;

    // Dynamically insert custom time into sorted order
    const customOption = {
      value: normalizedValue,
      label: format24HourTo12Hour(normalizedValue),
    };

    const combined = [...STANDARD_TIME_INTERVALS, customOption];
    combined.sort((a, b) => a.value.localeCompare(b.value));
    return combined;
  }, [normalizedValue]);

  return (
    <Select
      value={normalizedValue || undefined}
      onValueChange={(val) => {
        if (val) onChange(val);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "w-full bg-white h-10 px-3 flex items-center justify-between font-medium text-sm border-input shadow-sm hover:border-slate-300 focus:ring-2 focus:ring-blue-500 transition-colors",
          className
        )}
      >
        <div className="flex items-center gap-2 truncate">
          <Clock className="h-4 w-4 text-slate-400 shrink-0" />
          <SelectValue placeholder={placeholder}>
            {normalizedValue ? format24HourTo12Hour(normalizedValue) : placeholder}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-60 overflow-y-auto z-[99999] bg-white border border-slate-200 shadow-xl rounded-lg">
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="text-sm cursor-pointer hover:bg-blue-50 focus:bg-blue-50 py-1.5 px-3"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
