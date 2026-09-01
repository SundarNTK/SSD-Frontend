import { create } from "zustand";

type ToastTone = "create" | "update" | "delete" | "error";
type ToastEntry = { id: number; message: string; tone: ToastTone };

type ToastState = {
  toasts: ToastEntry[];
  dismiss: (id: number) => void;
};

let nextId = 1;
const AUTO_DISMISS_MS = 2000;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

function show(message: string, tone: ToastTone) {
  const id = nextId++;
  useToastStore.setState((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
  setTimeout(() => {
    useToastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, AUTO_DISMISS_MS);
}

/**
 * Fire-and-forget notices for create/update/delete. Shown as a short toast
 * on the same screen (the list stays visible — no full-page overlay).
 */
export const toast = {
  created: (message: string) => show(message, "create"),
  updated: (message: string) => show(message, "update"),
  deleted: (message: string) => show(message, "delete"),
  error: (message: string) => show(message, "error"),
};
