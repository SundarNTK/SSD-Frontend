"use client";

import { useEffect, useState } from "react";
import DivineListbox from "../../divine/DivineListbox";
import DivineDatePicker from "../../divine/DivineDatePicker";
import DivineInput from "../../divine/DivineInput";
import DivineButton from "../../divine/DivineButton";
import { api, unwrap, type ApiEnvelope } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { startOfToday, toISODateString } from "../../../lib/datetime";

type Ref = { _id: string; name: string };

type ConflictRow = {
  bookingNumber: string;
  startTime: string;
  endTime: string;
  hallOrPackage: string | null;
  customerName: string | null;
};

type AvailabilityResult = {
  bookingType: "individual" | "package";
  label: string | null;
  includedHalls: { _id: string; name: string; code: string }[];
  eventDate: string;
  startTime: string;
  endTime: string;
  available: boolean;
  conflicts: ConflictRow[];
};

/** Reachable only by a Super Admin with hallMealAccess — see hall-meal/layout.tsx. */
export default function HallAvailabilityPage() {
  const hallResource = useApiResource<Ref>(api, "/hall-meal/halls");
  const packageResource = useApiResource<Ref>(api, "/hall-meal/hall-packages");

  useEffect(() => {
    hallResource.list.run({ status: 1, pageSize: 100 });
    packageResource.list.run({ status: 1, pageSize: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hallOptions = hallResource.items.map((h) => ({ value: h._id, label: h.name }));
  const packageOptions = packageResource.items.map((p) => ({ value: p._id, label: p.name }));

  const [bookingType, setBookingType] = useState<"individual" | "package">("individual");
  const [hallId, setHallId] = useState("");
  const [hallPackageId, setHallPackageId] = useState("");
  const [eventDate, setEventDate] = useState(toISODateString(startOfToday()));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [result, setResult] = useState<AvailabilityResult | null>(null);

  const canCheck = eventDate && startTime && endTime && (bookingType === "individual" ? hallId : hallPackageId);

  async function handleCheck() {
    setCheckError(null);
    setResult(null);
    setChecking(true);
    try {
      const res = await api.post<ApiEnvelope<AvailabilityResult>>("/hall-meal/availability/check", {
        bookingType,
        hallId: bookingType === "individual" ? hallId : undefined,
        hallPackageId: bookingType === "package" ? hallPackageId : undefined,
        eventDate,
        startTime,
        endTime,
      });
      setResult(unwrap(res));
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Could not check availability.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold text-ink-100">Hall Availability</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Check whether a Hall (or every Hall inside a Hall Package) is free before creating or rescheduling a Booking.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-gold-500/20 bg-white p-5">
        <DivineListbox
          label="Booking Type"
          value={bookingType}
          onChange={(v) => setBookingType(v as "individual" | "package")}
          clearable={false}
          options={[
            { value: "individual", label: "Individual Hall" },
            { value: "package", label: "Hall Package" },
          ]}
        />

        {bookingType === "individual" ? (
          <DivineListbox label="Hall" value={hallId} onChange={setHallId} options={hallOptions} placeholder="Select a Hall…" />
        ) : (
          <DivineListbox
            label="Hall Package"
            value={hallPackageId}
            onChange={setHallPackageId}
            options={packageOptions}
            placeholder="Select a Hall Package…"
          />
        )}

        <DivineDatePicker staticLabel label="Event Date" value={eventDate} onChange={setEventDate} minDate={startOfToday()} />

        <div className="grid grid-cols-2 gap-4">
          <DivineInput staticLabel label="Start Time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <DivineInput staticLabel label="End Time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>

        <DivineButton variant="flame" type="button" disabled={!canCheck} loading={checking} onClick={handleCheck}>
          Check Availability
        </DivineButton>
        {checkError && <p className="text-[12.5px] text-crimson-500">{checkError}</p>}
      </div>

      {result && (
        <div
          className={`rounded-2xl border p-5 ${
            result.available ? "border-emerald-500/30 bg-emerald-500/5" : "border-crimson-500/30 bg-crimson-500/5"
          }`}
        >
          <p className={`text-[16px] font-bold ${result.available ? "text-emerald-700" : "text-crimson-600"}`}>
            {result.available ? "Available" : "Not Available — Booking Conflict"}
          </p>
          <p className="mt-1 text-[13px] text-ink-500">
            {result.label} · {result.eventDate.slice(0, 10)} · {result.startTime}–{result.endTime}
          </p>
          {result.includedHalls.length > 1 && (
            <p className="mt-1 text-[12.5px] text-ink-500">Halls included: {result.includedHalls.map((h) => h.name).join(", ")}</p>
          )}

          {!result.available && (
            <div className="mt-4 space-y-2">
              {result.conflicts.map((c) => (
                <div key={c.bookingNumber} className="rounded-lg border border-crimson-500/20 bg-white px-3.5 py-2.5 text-[13px]">
                  <span className="font-medium text-ink-100">{c.hallOrPackage}</span> is already booked{" "}
                  <span className="tabular-nums">
                    {c.startTime}–{c.endTime}
                  </span>{" "}
                  under <span className="tabular-nums text-amber-700">{c.bookingNumber}</span>
                  {c.customerName ? ` (${c.customerName})` : ""}.
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
