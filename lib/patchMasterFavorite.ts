import { toast } from "./toastStore";

type UpdateFn = {
  run: (id: string, body: Record<string, unknown>) => Promise<unknown>;
};

/** Same one-tap patch-and-toast contract as patchMasterStatus.ts, for the `favorite` flag. */
export async function patchMasterFavorite(
  update: UpdateFn,
  id: string,
  favorite: boolean,
  label: string,
  extra: Record<string, unknown> = {},
) {
  const ok = await update.run(id, { favorite, ...extra });
  if (ok !== undefined) {
    toast.updated(favorite ? `${label} added to Favorites.` : `${label} removed from Favorites.`);
  }
}
