"use client";

import { useEffect, useRef, useState } from "react";
import { api, unwrap, type ApiEnvelope } from "../../../lib/api";
import { toast } from "../../../lib/toastStore";
import DivineInput from "../../divine/DivineInput";
import DivineButton from "../../divine/DivineButton";
import { FORM_LABEL } from "../../divine/formFieldStyles";

export type SelectedCustomer = { _id: string; name: string; email: string; mobileNumber: string | null };

type CustomerSearchSelectProps = {
  value: SelectedCustomer | null;
  onChange: (customer: SelectedCustomer | null) => void;
  error?: string;
};

/**
 * Search an existing devotee, or add a walk-in on the spot — the same
 * "Personal Details" step every booking screen needs. AdminBookingPage.tsx
 * and PosPortalPage.tsx each reimplement this same search-input pattern
 * independently with no shared component; built fresh here for Hall
 * Booking rather than adding a third copy, without refactoring those two
 * unrelated files.
 */
export default function CustomerSearchSelect({ value, onChange, error }: CustomerSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SelectedCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // No setResults([]) here: the dropdown that reads `results` only ever
    // renders when `query.trim()` is true and `value` is unset (see the JSX
    // below), so a stale non-empty `results` is never actually shown once
    // either condition flips — nothing to clear.
    if (!query.trim() || value) return;
    const timer = setTimeout(() => {
      setSearching(true);
      api
        .get<ApiEnvelope<{ items: SelectedCustomer[] }>>("/hall-meal/hall-bookings/customers/search", { params: { query } })
        .then((res) => setResults(unwrap(res).items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectCustomer(customer: SelectedCustomer) {
    onChange(customer);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function clearCustomer() {
    onChange(null);
    setQuery("");
  }

  async function submitNewCustomer() {
    setCreateError(null);
    if (!newName.trim() || !newEmail.trim()) {
      setCreateError("Name and email are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await api.post<ApiEnvelope<SelectedCustomer>>("/hall-meal/hall-bookings/customers", {
        name: newName,
        email: newEmail,
        mobileNumber: newMobile || undefined,
      });
      const customer = unwrap(res);
      selectCustomer(customer);
      setShowAddNew(false);
      setNewName("");
      setNewEmail("");
      setNewMobile("");
      toast.created("Customer added successfully.");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create the customer.");
    } finally {
      setCreating(false);
    }
  }

  if (value) {
    return (
      <div className="w-full">
        <p className={FORM_LABEL}>Customer</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#f0b4a0] bg-white px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink-100">{value.name}</p>
            <p className="truncate text-[12px] text-ink-500">{[value.mobileNumber, value.email].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={clearCustomer} className="shrink-0 text-[12.5px] font-medium text-amber-600 hover:underline">
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <DivineInput
        staticLabel
        label="Customer"
        placeholder="Search by name, mobile or email…"
        value={query}
        error={error}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim() && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gold-500/25 bg-white shadow-[0_16px_40px_-14px_rgba(0,0,0,0.35)]">
          {searching && <p className="px-3.5 py-2.5 text-[13px] text-ink-500">Searching…</p>}
          {!searching && results.length === 0 && (
            <p className="px-3.5 py-2.5 text-[13px] text-ink-500">No matches for &ldquo;{query}&rdquo;.</p>
          )}
          <ul>
            {results.map((c) => (
              <li key={c._id}>
                <button
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className="flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left hover:bg-gold-500/10"
                >
                  <span className="text-[13.5px] font-medium text-ink-100">{c.name}</span>
                  <span className="text-[12px] text-ink-500">{[c.mobileNumber, c.email].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setShowAddNew(true);
              setOpen(false);
            }}
            className="w-full border-t border-gold-500/15 px-3.5 py-2.5 text-left text-[13px] font-medium text-amber-600 hover:bg-gold-500/10"
          >
            + Add a new customer
          </button>
        </div>
      )}

      {showAddNew && (
        <div className="mt-3 rounded-lg border border-gold-500/25 bg-[#fffaf0] p-3.5">
          <p className="mb-2 text-[13px] font-semibold text-maroon">New Customer</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DivineInput staticLabel label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <DivineInput staticLabel label="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <DivineInput staticLabel label="Mobile Number" value={newMobile} onChange={(e) => setNewMobile(e.target.value)} />
          </div>
          {createError && <p className="mt-2 text-[12.5px] text-crimson-500">{createError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setShowAddNew(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="button" loading={creating} onClick={submitNewCustomer}>
              Add Customer
            </DivineButton>
          </div>
        </div>
      )}
    </div>
  );
}
