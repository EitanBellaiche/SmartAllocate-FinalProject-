import { useEffect, useRef, useState } from "react";

function formatDisplayValue(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isValidDateParts(day, month, year) {
  const parsed = new Date(year, month - 1, day);
  return !(
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  );
}

function parseInputValue(value) {
  const text = String(value || "").trim();
  if (!text) return { parsed: "", error: "" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { parsed: text, error: "" };
  const match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (!match) return { parsed: null, error: "" };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!isValidDateParts(day, month, year)) {
    if (isValidDateParts(month, day, year)) {
      return {
        parsed: null,
        error: `Use dd/mm/yyyy. For this date enter ${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}.`,
      };
    }
    return {
      parsed: null,
      error: "Enter a valid date in dd/mm/yyyy format.",
    };
  }

  return {
    parsed: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    error: "",
  };
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
  const [error, setError] = useState("");
  const [preferNativePicker, setPreferNativePicker] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    setText(formatDisplayValue(value));
    setError("");
  }, [value]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia?.("(pointer: coarse)");
    const detectTouchDevice = () =>
      Boolean(
        mediaQuery?.matches ||
          window.navigator?.maxTouchPoints > 0 ||
          "ontouchstart" in window
      );

    const updatePreference = () => {
      setPreferNativePicker(detectTouchDevice());
    };

    updatePreference();

    if (!mediaQuery?.addEventListener) return undefined;
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  function commit(rawValue) {
    const nextValue = String(rawValue || "").trim();
    if (!nextValue) {
      setText("");
      setError("");
      onChange?.("");
      return;
    }

    const { parsed, error: parseError } = parseInputValue(nextValue);
    if (!parsed) {
      setText(nextValue);
      setError(parseError || "Enter a valid date in dd/mm/yyyy format.");
      return;
    }
    if ((min && parsed < min) || (max && parsed > max)) {
      setText(formatDisplayValue(value));
      setError("Selected date is outside the allowed range.");
      return;
    }

    setText(formatDisplayValue(parsed));
    setError("");
    onChange?.(parsed);
  }

  if (preferNativePicker) {
    return (
      <input
        {...props}
        type="date"
        dir="ltr"
        className={className}
        value={value || ""}
        min={min}
        max={max}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  }

  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        dir="ltr"
        placeholder={placeholder}
        className={`${className}${error ? " border-rose-400 focus:border-rose-500" : ""}`}
        value={text}
        aria-invalid={error ? "true" : "false"}
        onChange={(e) => {
          const nextValue = e.target.value;
          setText(nextValue);
          const trimmed = String(nextValue || "").trim();
          if (!trimmed) {
            setError("");
            return;
          }
          const { parsed, error: parseError } = parseInputValue(trimmed);
          setError(
            parsed || (!parseError && trimmed.length < 8)
              ? ""
              : parseError || "Enter a valid date in dd/mm/yyyy format."
          );
        }}
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
      {error && (
        <div className="mt-2 text-sm text-rose-600">
          {error}
        </div>
      )}
    </div>
  );
}
