import { create } from "zustand";

type ToastTone = "create" | "update" | "delete" | "error";
type ToastEntry = { id: number; message: string; tone: ToastTone };

type ToastState = {
  toasts: ToastEntry[];
  dismiss: (id: number) => void;
};

let nextId = 1;
const AUTO_DISMISS_MS = 3000;

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
 * Fire-and-forget notices for actions that already closed their own modal —
 * create/update/delete across every master screen call the matching one
 * right after the drawer/dialog closes, so "it worked" is confirmed
 * somewhere durable rather than only implied by the modal disappearing.
 * Each tone gets its own color in ToastStack (gold/blue/crimson) so the
 * kind of change that just happened is legible at a glance.
 */
export const toast = {
  created: (message: string) => show(message, "create"),
  updated: (message: string) => show(message, "update"),
  deleted: (message: string) => show(message, "delete"),
  error: (message: string) => show(message, "error"),
};
