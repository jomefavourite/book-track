"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider duration={3500}>
      {toasts.map(({ id, title, description, variant, open }) => (
        <Toast
          key={id}
          open={open}
          onOpenChange={(isOpen) => {
            if (!isOpen) dismiss(id);
          }}
          variant={variant}
        >
          <div className="flex flex-col gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && (
              <ToastDescription>{description}</ToastDescription>
            )}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
