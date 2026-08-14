"use client";

import { useId } from "react";
import { ExternalLinkIcon } from "@/components/icons";

interface UrlFieldProps {
  label: string;
  value: string | null;
  placeholder: string;
  onChange: (value: string) => void;
}

export function UrlField({ label, value, placeholder, onChange }: UrlFieldProps) {
  const inputId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-[#2D2B55] mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="url"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
        />
        {value && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            aria-label={`${label}を開く`}
            className="shrink-0 text-[#6B6885] hover:text-[#7C3AED] p-2 rounded-lg border border-[#E8E6F0] hover:border-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
          >
            <ExternalLinkIcon className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
