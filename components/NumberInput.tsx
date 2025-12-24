
import React from 'react';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  min?: number;
  suffix?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({ label, value, onChange, disabled, min = 1, suffix = 'px' }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
    <div className="relative">
      <input
        type="number"
        value={value}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{suffix}</span>
    </div>
  </div>
);

export default NumberInput;
