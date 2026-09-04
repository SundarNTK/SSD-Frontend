import { toast } from "./toastStore";

type UpdateFn = {
  run: (id: string, body: Record<string, unknown>) => Promise<unknown>;
};

export async function patchMasterStatus(
  update: UpdateFn,
  id: string,
  status: number,
  label: string,
  extra: Record<string, unknown> = {},
) {
  const ok = await update.run(id, { status, ...extra });
  if (ok !== undefined) {
    toast.updated(status === 1 ? `${label} set to Active.` : `${label} set to Inactive.`);
  }
}
