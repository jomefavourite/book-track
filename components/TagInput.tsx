"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  PRESET_TAGS,
  sanitizeTags,
  normalizeTagKey,
  MAX_TAGS_PER_BOOK,
} from "@/lib/bookTags";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Controlled tag picker: tap curated preset chips and/or type custom tags.
 * All mutations run through `sanitizeTags` so casing/dupe/limit rules are
 * enforced consistently (and mirror the server-side sanitation).
 */
export default function TagInput({ value, onChange }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const selectedKeys = new Set(value.map(normalizeTagKey));
  const atLimit = value.length >= MAX_TAGS_PER_BOOK;

  const addTag = (tag: string) => {
    onChange(sanitizeTags([...value, tag]));
  };

  const removeTag = (tag: string) => {
    const key = normalizeTagKey(tag);
    onChange(value.filter((t) => normalizeTagKey(t) !== key));
  };

  const togglePreset = (tag: string) => {
    if (selectedKeys.has(normalizeTagKey(tag))) {
      removeTag(tag);
    } else {
      addTag(tag);
    }
  };

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      addTag(trimmed);
    }
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-foreground">
        Tags <span className="text-muted-foreground">(optional)</span>
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        Add topics like Finance or Relationships to group books on your profile
      </p>

      {/* Selected tags */}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((tag) => (
            <span
              key={normalizeTagKey(tag)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
                className="rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Custom tag input */}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        disabled={atLimit}
        className="mt-2 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        placeholder={
          atLimit
            ? `Tag limit reached (${MAX_TAGS_PER_BOOK})`
            : "Type a tag and press Enter"
        }
      />

      {/* Preset suggestions */}
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESET_TAGS.map((tag) => {
          const isSelected = selectedKeys.has(normalizeTagKey(tag));
          return (
            <button
              key={tag}
              type="button"
              onClick={() => togglePreset(tag)}
              disabled={!isSelected && atLimit}
              className={
                isSelected
                  ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm text-primary"
                  : "rounded-full border border-input bg-background px-3 py-1 text-sm text-muted-foreground hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
