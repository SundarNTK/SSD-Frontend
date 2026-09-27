"use client";

import DivineInput from "../divine/DivineInput";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import TamilNameField from "./TamilNameField";
import { PlusIcon, TrashIcon } from "../divine/icons";

/** The populated, read-only shape a master's list/edit response returns a family member in. */
export type FamilyMember = {
  nameEnglish: string;
  nameTamil: string;
  natchathiram: { _id: string; name: string; tamilName: string } | null;
};

/** A locally-edited family member row — `natchathiramId` is the raw listbox value, resolved to an id on submit. */
export type EditableFamilyMember = { nameEnglish: string; nameTamil: string; natchathiramId: string };

// Matches Customer.maxFamilyMembers' own schema default — used to cap the Add
// Customer / Add Admin User forms' family member rows, since there's no
// record yet to read an actual cap off of.
export const DEFAULT_MAX_FAMILY_MEMBERS = 5;

export function toFamilyMemberPayload(members: EditableFamilyMember[]) {
  return members
    .filter((m) => m.nameEnglish.trim() || m.nameTamil.trim())
    .map((m) => ({
      nameEnglish: m.nameEnglish.trim(),
      nameTamil: m.nameTamil.trim(),
      natchathiram: m.natchathiramId || null,
    }));
}

type FamilyMemberEditorProps = {
  members: EditableFamilyMember[];
  maxMembers: number;
  nakshathiramOptions: ListboxOption[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<EditableFamilyMember>) => void;
};

/** The add/edit/remove repeater shared by the Customer and Admin User masters' Add/Edit forms. */
export default function FamilyMemberEditor({ members, maxMembers, nakshathiramOptions, onAdd, onRemove, onUpdate }: FamilyMemberEditorProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-amber-600">Family members ({members.length})</p>
        {members.length < maxMembers && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 text-[12.5px] font-medium text-maroon hover:text-maroon-hover"
          >
            <PlusIcon />
            Add family member
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="rounded-xl border border-gold-500/20 bg-ivory-100 p-3 text-[12.5px] text-ink-500">No family members yet.</p>
      ) : (
        <div className="space-y-3">
          {members.map((m, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border border-gold-500/20 bg-ivory-100 p-3">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                <DivineInput
                  staticLabel
                  label="Name (English)"
                  value={m.nameEnglish}
                  onChange={(e) => onUpdate(i, { nameEnglish: e.target.value })}
                />
                <TamilNameField
                  staticLabel
                  label="Name (Tamil)"
                  englishName={m.nameEnglish}
                  value={m.nameTamil}
                  onChange={(v) => onUpdate(i, { nameTamil: v })}
                />
                <DivineListbox
                  label="Natchathiram"
                  value={m.natchathiramId}
                  onChange={(v) => onUpdate(i, { natchathiramId: v })}
                  options={nakshathiramOptions}
                  placeholder="Select natchathiram"
                />
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remove family member"
                className="mt-6 flex h-8 w-8 shrink-0 items-center justify-center text-crimson-500 transition-transform duration-200 hover:scale-110 hover:text-crimson-600 active:scale-95"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
