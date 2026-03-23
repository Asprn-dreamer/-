
import React from 'react';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  min?: number;
  suffix?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({ label, value, onChange, disabled, min = 0, suffix = 'px' }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>}
    <div className="relative group">
      <input
        type="number"
        value={value}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full pl-3 pr-10 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed group-hover:border-slate-300"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none group-focus-within:text-brand-500 transition-colors">{suffix}</span>
    </div>
  </div>
);

export default NumberInput;
