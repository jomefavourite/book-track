"use client";

import { useEffect, useState } from "react";
import { BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const hasNote = Boolean(note?.trim());

  useEffect(() => {
    if (!open) {
      setDraft(note ?? "");
    }
  }, [note, open]);

  const save = async () => {
    setIsSaving(true);
    try {
      await onSave(draft);
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={hasNote ? "secondary" : "outline"}
        size="sm"
        disabled={!canEdit}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={
          compact
            ? "h-6 w-full justify-start px-1.5 text-[10px]"
            : "h-8 w-full justify-start text-xs"
        }
      >
        <BookOpenText className={compact ? "h-3 w-3" : "h-4 w-4"} />
        <span className="truncate">{hasNote ? "Edit note" : "Add note"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onClick={(event) => event.stopPropagation()}
          className="sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>Reflection note</DialogTitle>
            <DialogDescription>{dayLabel}</DialogDescription>
          </DialogHeader>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!canEdit || isSaving}
            rows={8}
            className="min-h-40 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="What stood out from today&apos;s reading?"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={!canEdit || isSaving}>
              {isSaving ? "Saving..." : "Save note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
