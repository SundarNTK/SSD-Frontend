import { useCallback, useState } from "react";
import { extractErrorMessage } from "./api";
import { toast } from "./toastStore";

/**
 * Shared submit-state helper — every auth/master form needs the same
 * loading + error handling around an API call. Write it once here, not
 * per page.
 *
 * A failure also pops the same red toast every create/update/delete success
 * already uses (see ToastStack) — one common popup for both outcomes across
 * every master form, instead of each screen rendering its own inline error
 * banner. `error`/`setError` are kept for callers that still want the
 * message available synchronously (e.g. to re-open a dialog), but nothing
 * renders it as a banner anymore — see FormDrawer.
 */
export function useAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>
) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args) => {
      setError(null);
      setSubmitting(true);
      try {
        const result = await action(...args);
        return result;
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        toast.error(message);
        return undefined;
      } finally {
        setSubmitting(false);
      }
    },
    [action]
  );

  return { run, submitting, error, setError };
}