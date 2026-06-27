"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * Accessible 6-box OTP input: keyboard-navigable (arrows, backspace), paste of a
 * full code, numeric-only, with `one-time-code` autofill on the first box.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
}: Props) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next: string[]) => {
    const joined = next.join("").slice(0, length);
    onChange(joined);
    if (joined.length === length && !joined.includes("")) onComplete?.(joined);
  };

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const next = digits.slice();
    if (raw.length > 1) {
      // Multiple chars (autofill): spread from the current box.
      raw
        .split("")
        .slice(0, length - i)
        .forEach((c, k) => {
          next[i + k] = c;
        });
      commit(next);
      refs.current[Math.min(i + raw.length, length - 1)]?.focus();
      return;
    }
    next[i] = raw;
    commit(next);
    if (raw && i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (
    i: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace") {
      const next = digits.slice();
      if (digits[i]) {
        next[i] = "";
        commit(next);
      } else if (i > 0) {
        next[i - 1] = "";
        commit(next);
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!raw) return;
    onChange(raw);
    refs.current[Math.min(raw.length, length) - 1]?.focus();
    if (raw.length === length) onComplete?.(raw);
  };

  return (
    <div className="flex w-full justify-center gap-2.5" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d}
          disabled={disabled}
          aria-label={`Chiffre ${i + 1} sur ${length}`}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={cn(
            "aspect-square w-full max-w-[3.25rem] rounded-xl border border-border/60 bg-card/70 text-center text-xl font-semibold outline-none transition",
            "focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30",
            disabled && "opacity-50",
          )}
        />
      ))}
    </div>
  );
}
