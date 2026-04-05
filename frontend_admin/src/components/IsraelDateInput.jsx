import { useEffect, useRef, useState } from "react";

function formatDisplayValue(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseInputValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function IsraelDateInput({
  value,
  onChange,
  className = "",
  placeholder = "dd/mm/yyyy",
  min,
  max,
  ...props
}) {
  const [text, setText] = useState(formatDisplayValue(value));
  const pickerRef = useRef(null);

  useEffect(() => {
    setText(formatDisplayValue(value));
  }, [value]);

  function commit(rawValue) {
    const nextValue = String(rawValue || "").trim();
    if (!nextValue) {
      setText("");
      onChange?.("");
      return;
    }

    const parsed = parseInputValue(nextValue);
    if (!parsed) {
      setText(nextValue);
      return;
    }
    if ((min && parsed < min) || (max && parsed > max)) {
      setText(formatDisplayValue(value));
      return;
    }

    setText(formatDisplayValue(parsed));
    onChange?.(parsed);
  }

  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        dir="ltr"
        placeholder={placeholder}
        className={className}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
      />
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ""}
        min={min}
        max={max}
        onChange={(e) => commit(e.target.value)}
        className="absolute inset-0 opacity-0 pointer-events-none"
      />
      <button
        type="button"
        aria-label="Open calendar"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (pickerRef.current?.showPicker) {
            pickerRef.current.showPicker();
            return;
          }
          pickerRef.current?.focus();
          pickerRef.current?.click();
        }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M3 10h18" />
        </svg>
      </button>
    </div>
  );
}
