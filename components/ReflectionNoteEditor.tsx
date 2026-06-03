"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ReflectionNoteEditorProps {
  dayLabel: string;
  note?: string;
  canEdit: boolean;
  compact?: boolean;
  onSave: (note: string) => Promise<void>;
}

export default function ReflectionNoteEditor({
  dayLabel,
  note,
  canEdit,
  compact = false,
  onSave,
}: ReflectionNoteEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(false);
  const hasNote = Boolean(note?.trim());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setDraft(note ?? "");
    }
  }, [note, open]);

  const save = async () => {
    setIsSaving(true);
    try {
      await onSave(draft);
      if (mountedRef.current) {
        setOpen(false);
      }
    } finally {
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (mountedRef.current) {
          setOpen(nextOpen);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={hasNote ? "secondary" : "outline"}
          size="sm"
          disabled={!canEdit}
          onClick={(event) => event.stopPropagation()}
          className={
            compact
              ? "h-6 w-full justify-start gap-1 px-1.5 text-[10px]"
              : "h-8 w-full justify-start gap-1.5 text-xs"
          }
        >
          <BookOpenText className={compact ? "h-3 w-3" : "h-4 w-4"} />
          <span className="truncate">{hasNote ? "Edit note" : "Add note"}</span>
          <ChevronDown
            className={`ml-auto shrink-0 transition-transform ${
              open ? "rotate-180" : ""
            } ${compact ? "h-3 w-3" : "h-4 w-4"}`}
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={
          compact
            ? "w-[min(calc(100vw-2rem),20rem)] p-3"
            : "w-[min(calc(100vw-2rem),28rem)] p-4"
        }
      >
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="space-y-3"
        >
          <div>
            <h3 className="text-sm font-semibold text-popover-foreground">
              Reflection note
            </h3>
            <p className="text-xs text-muted-foreground">{dayLabel}</p>
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!canEdit || isSaving}
            rows={compact ? 5 : 7}
            className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="What stood out from today's reading?"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={!canEdit || isSaving}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
