"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomerSearchSelect, { type SelectedCustomer } from "./CustomerSearchSelect";
import DivineListbox from "../../divine/DivineListbox";
import DivineDatePicker from "../../divine/DivineDatePicker";
import DivineInput from "../../divine/DivineInput";
import DivineTextarea from "../../divine/DivineTextarea";
import DivineToggle from "../../divine/DivineToggle";
import DivineMultiSelect from "../../divine/DivineMultiSelect";
import DivineButton from "../../divine/DivineButton";
import { api, unwrap, type ApiEnvelope } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { toast } from "../../../lib/toastStore";
import { startOfToday, toISODateString } from "../../../lib/datetime";

type Ref = { _id: string; name: string };
type HallRef = { _id: string; name: string; individualBookingRate: number | null; minimumBookingDuration: number | null; depositAmount: number };
type HallPackageRef = { _id: string; name: string; standardSessionDuration: number; packagePrice: number; depositAmount: number; gstApplicable: boolean };
type FoodMenuItemRef = { _id: string; name: string; pricingBasis: string; cost: number };
type FoodPackageRef = {
  _id: string;
  name: string;
  minimumBookingCount: number;
  packagePricePerPax: number;
  menuItems: { menuItem: FoodMenuItemRef; includedInPackage: boolean }[];
};

type AvailabilityResult = {
  available: boolean;
  conflicts: { bookingNumber: string; startTime: string; endTime: string; hallOrPackage: string | null; customerName: string | null }[];
};

type PricingPreview = {
  hallAmount: number;
  additionalHourAmount: number;
  foodAmount: number;
  foodAdjustmentAmount: number;
  subtotalAmount: number;
  discountAmount: number;
  gstPercentage: number;
  gstAmount: number;
  finalAmount: number;
  depositAmount: number;
};

/** Reachable only by a Super Admin with hallMealAccess — see hall-meal/layout.tsx. */
export default function CreateHallBookingPage() {
  const router = useRouter();

  const hallResource = useApiResource<HallRef>(api, "/hall-meal/halls");
  const packageResource = useApiResource<HallPackageRef>(api, "/hall-meal/hall-packages");
  const purposeResource = useApiResource<Ref>(api, "/hall-meal/hall-purposes");
  const foodPackageResource = useApiResource<FoodPackageRef>(api, "/hall-meal/food-packages");
  const menuItemResource = useApiResource<FoodMenuItemRef>(api, "/hall-meal/food-menu-items");
  const serviceResource = useApiResource<Ref>(api, "/hall-meal/additional-services");
  const paymentModeResource = useApiResource<Ref>(api, "/masters/payment-modes");

  useEffect(() => {
    hallResource.list.run({ status: 1, pageSize: 100 });
    packageResource.list.run({ status: 1, pageSize: 100 });
    purposeResource.list.run({ status: 1, pageSize: 100 });
    foodPackageResource.list.run({ status: 1, pageSize: 100 });
    menuItemResource.list.run({ status: 1, pageSize: 100 });
    serviceResource.list.run({ status: 1, pageSize: 100 });
    paymentModeResource.list.run({ status: 1, pageSize: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Customer ──
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);

  // ── Hall / Package ──
  const [bookingType, setBookingType] = useState<"individual" | "package">("individual");
  const [hallId, setHallId] = useState("");
  const [hallPackageId, setHallPackageId] = useState("");

  // ── Event details ──
  const [hallPurposeId, setHallPurposeId] = useState("");
  const [eventDate, setEventDate] = useState(toISODateString(startOfToday()));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // ── Availability ──
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  function resetAvailability() {
    setAvailability(null);
  }

  // ── Food ──
  const [foodRequired, setFoodRequired] = useState(false);
  const [foodPackageId, setFoodPackageId] = useState("");
  const [paxCount, setPaxCount] = useState<number>(0);
  const [removedMenuItemIds, setRemovedMenuItemIds] = useState<string[]>([]);
  const [additionalMenuItemIds, setAdditionalMenuItemIds] = useState<string[]>([]);
  const [additionalQuantities, setAdditionalQuantities] = useState<Record<string, number>>({});

  const selectedFoodPackage = foodPackageResource.items.find((p) => p._id === foodPackageId) ?? null;

  // ── Additional Services ──
  const [additionalServiceIds, setAdditionalServiceIds] = useState<string[]>([]);

  // ── Discount ──
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [membershipNumber, setMembershipNumber] = useState("");
  const [memberName, setMemberName] = useState("");

  const [remarks, setRemarks] = useState("");

  // ── Payment ──
  const [paymentType, setPaymentType] = useState<"" | "deposit" | "advance">("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentModeId, setPaymentModeId] = useState("");
  const [paymentSubtype, setPaymentSubtype] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const paymentModeName = paymentModeResource.items.find((m) => m._id === paymentModeId)?.name ?? "";
  const isNets = paymentModeName === "NETS";
  const isOther = paymentModeName === "Other";

  // ── Pricing preview ──
  const [pricing, setPricing] = useState<PricingPreview | null>(null);
  // Which payload `pricing` was actually computed for — compared against the
  // *current* payload below so a stale price from a previous selection can
  // never satisfy `canConfirm` for a since-changed one. This is what lets the
  // effect below skip an eager `setPricing(null)` on every input change
  // (a synchronous setState at the top of an effect body) without a
  // stale-price correctness gap: pricingIsFresh does that invalidation by
  // comparison instead, entirely during render.
  const [pricingKey, setPricingKey] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const previewPayload = useMemo(() => {
    if (!hallPurposeId || !eventDate || !startTime || !endTime) return null;
    if (bookingType === "individual" && !hallId) return null;
    if (bookingType === "package" && !hallPackageId) return null;
    if (foodRequired && (!foodPackageId || !paxCount)) return null;
    return {
      bookingType,
      hallId: bookingType === "individual" ? hallId : undefined,
      hallPackageId: bookingType === "package" ? hallPackageId : undefined,
      hallPurposeId,
      eventDate,
      startTime,
      endTime,
      foodRequired,
      foodPackageId: foodRequired ? foodPackageId : undefined,
      paxCount: foodRequired ? paxCount : undefined,
      removedMenuItemIds,
      additionalMenuItems: additionalMenuItemIds.map((id) => ({ menuItemId: id, quantity: additionalQuantities[id] || 1 })),
      additionalServiceIds,
      discountPercentage,
      membershipNumber: discountPercentage > 0 ? membershipNumber : undefined,
      memberName: discountPercentage > 0 ? memberName : undefined,
    };
  }, [
    bookingType, hallId, hallPackageId, hallPurposeId, eventDate, startTime, endTime,
    foodRequired, foodPackageId, paxCount, removedMenuItemIds, additionalMenuItemIds, additionalQuantities,
    additionalServiceIds, discountPercentage, membershipNumber, memberName,
  ]);

  useEffect(() => {
    if (!previewPayload) return;
    const key = JSON.stringify(previewPayload);
    const timer = setTimeout(() => {
      setPricingError(null);
      api
        .post<ApiEnvelope<PricingPreview>>("/hall-meal/hall-bookings/preview", previewPayload)
        .then((res) => {
          setPricing(unwrap(res));
          setPricingKey(key);
        })
        .catch((err) => {
          setPricingKey(null);
          setPricingError(err instanceof Error ? err.message : "Could not calculate pricing.");
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [previewPayload]);

  const pricingIsFresh = pricing !== null && pricingKey === (previewPayload ? JSON.stringify(previewPayload) : null);

  async function handleCheckAvailability() {
    if (!eventDate || !startTime || !endTime) return;
    setCheckingAvailability(true);
    try {
      const res = await api.post<ApiEnvelope<AvailabilityResult>>("/hall-meal/availability/check", {
        bookingType,
        hallId: bookingType === "individual" ? hallId : undefined,
        hallPackageId: bookingType === "package" ? hallPackageId : undefined,
        eventDate,
        startTime,
        endTime,
      });
      setAvailability(unwrap(res));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check availability.");
    } finally {
      setCheckingAvailability(false);
    }
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canConfirm =
    customer &&
    hallPurposeId &&
    eventDate &&
    startTime &&
    endTime &&
    (bookingType === "individual" ? hallId : hallPackageId) &&
    availability?.available &&
    pricingIsFresh;

  async function handleConfirm() {
    if (!customer || !previewPayload) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await api.post<ApiEnvelope<{ bookingNumber: string; _id: string }>>("/hall-meal/hall-bookings", {
        ...previewPayload,
        customerId: customer._id,
        remarks,
        paymentType: paymentAmount > 0 ? paymentType || undefined : undefined,
        paymentAmount,
        paymentModeId: paymentAmount > 0 ? paymentModeId : undefined,
        paymentSubtype,
        referenceNo,
        paymentRemarks,
      });
      const booking = unwrap(res);
      toast.created(`Hall Booking ${booking.bookingNumber} confirmed successfully.`);
      router.push(`/admin/hall-meal/hall-bookings/${booking._id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not confirm the booking.");
    } finally {
      setSubmitting(false);
    }
  }

  const hallOptions = hallResource.items.map((h) => ({ value: h._id, label: h.name }));
  const packageOptions = packageResource.items.map((p) => ({ value: p._id, label: p.name }));
  const purposeOptions = purposeResource.items.map((p) => ({ value: p._id, label: p.name }));
  const foodPackageOptions = foodPackageResource.items.map((p) => ({ value: p._id, label: p.name }));
  const menuItemOptions = menuItemResource.items.map((m) => ({ value: m._id, label: m.name }));
  const serviceOptions = serviceResource.items.map((s) => ({ value: s._id, label: s.name }));
  const paymentModeOptions = paymentModeResource.items.map((m) => ({ value: m._id, label: m.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div>
        <h1 className="font-display text-[26px] font-bold text-ink-100">New Hall Booking</h1>
        <p className="mt-1 text-[13px] text-ink-500">Customer → Hall/Package → Event Details → Availability → Food → Services → Pricing → Discount → Payment → Confirm.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Customer */}
          <Section title="Customer">
            <CustomerSearchSelect value={customer} onChange={setCustomer} />
          </Section>

          {/* Hall / Package */}
          <Section title="Hall / Package">
            <DivineListbox
              label="Booking Type"
              value={bookingType}
              clearable={false}
              onChange={(v) => {
                setBookingType(v as "individual" | "package");
                setHallId("");
                setHallPackageId("");
                resetAvailability();
              }}
              options={[
                { value: "individual", label: "Individual Hall" },
                { value: "package", label: "Hall Package" },
              ]}
            />
            {bookingType === "individual" ? (
              <DivineListbox
                label="Hall"
                value={hallId}
                onChange={(v) => { setHallId(v); resetAvailability(); }}
                options={hallOptions}
                placeholder="Select a Hall…"
              />
            ) : (
              <DivineListbox
                label="Hall Package"
                value={hallPackageId}
                onChange={(v) => { setHallPackageId(v); resetAvailability(); }}
                options={packageOptions}
                placeholder="Select a Hall Package…"
              />
            )}
          </Section>

          {/* Event Details */}
          <Section title="Event Details">
            <DivineListbox label="Hall Purpose" value={hallPurposeId} onChange={setHallPurposeId} options={purposeOptions} placeholder="Select a purpose…" />
            <DivineDatePicker
              staticLabel
              label="Event Date"
              value={eventDate}
              onChange={(v) => { setEventDate(v); resetAvailability(); }}
              minDate={startOfToday()}
            />
            <div className="grid grid-cols-2 gap-4">
              <DivineInput staticLabel label="Start Time" type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); resetAvailability(); }} />
              <DivineInput staticLabel label="End Time" type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); resetAvailability(); }} />
            </div>
          </Section>

          {/* Availability */}
          <Section title="Availability">
            <DivineButton
              variant="flame"
              type="button"
              fullWidth={false}
              loading={checkingAvailability}
              disabled={!eventDate || !startTime || !endTime || (bookingType === "individual" ? !hallId : !hallPackageId)}
              onClick={handleCheckAvailability}
            >
              Check Availability
            </DivineButton>
            {availability && (
              <div className={`mt-3 rounded-lg border px-3.5 py-2.5 text-[13px] ${availability.available ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" : "border-crimson-500/30 bg-crimson-500/5 text-crimson-600"}`}>
                {availability.available ? (
                  "Available for the selected date and time."
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium">Not Available — Booking Conflict</p>
                    {availability.conflicts.map((c) => (
                      <p key={c.bookingNumber}>
                        {c.hallOrPackage} is booked {c.startTime}–{c.endTime} under {c.bookingNumber}
                        {c.customerName ? ` (${c.customerName})` : ""}.
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Food */}
          <Section title="Food">
            <DivineToggle label="Food Required" checked={foodRequired} onChange={setFoodRequired} onLabel="Yes" offLabel="No" />
            {foodRequired && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <DivineListbox label="Food Package" value={foodPackageId} onChange={setFoodPackageId} options={foodPackageOptions} placeholder="Select a Food Package…" />
                  <DivineInput
                    staticLabel
                    label="Pax Count"
                    type="number"
                    value={paxCount || ""}
                    onChange={(e) => setPaxCount(Number(e.target.value))}
                  />
                </div>
                {selectedFoodPackage && paxCount > 0 && paxCount < selectedFoodPackage.minimumBookingCount && (
                  <p className="text-[12.5px] text-crimson-500">
                    This Food Package requires a minimum of {selectedFoodPackage.minimumBookingCount} pax.
                  </p>
                )}

                {selectedFoodPackage && (
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-ink-200">Standard Menu — untick to remove for this booking</p>
                    <div className="space-y-1.5 rounded-lg border border-gold-500/20 bg-white p-3">
                      {selectedFoodPackage.menuItems.map((row) => (
                        <label key={row.menuItem._id} className="flex items-center gap-2 text-[13px]">
                          <input
                            type="checkbox"
                            checked={!removedMenuItemIds.includes(row.menuItem._id)}
                            onChange={(e) =>
                              setRemovedMenuItemIds((prev) =>
                                e.target.checked ? prev.filter((id) => id !== row.menuItem._id) : [...prev, row.menuItem._id]
                              )
                            }
                          />
                          {row.menuItem.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <DivineMultiSelect
                  label="Additional Menu Items"
                  values={additionalMenuItemIds}
                  onChange={setAdditionalMenuItemIds}
                  options={menuItemOptions}
                  placeholder="None"
                />
                {additionalMenuItemIds.length > 0 && (
                  <div className="space-y-2">
                    {additionalMenuItemIds.map((id) => {
                      const item = menuItemResource.items.find((m) => m._id === id);
                      return (
                        <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-gold-500/20 bg-white px-3.5 py-2">
                          <span className="text-[13px]">{item?.name}</span>
                          <input
                            type="number"
                            min={1}
                            className="w-20 rounded-md border border-[#f0b4a0] px-2 py-1 text-right text-[13px]"
                            value={additionalQuantities[id] ?? 1}
                            onChange={(e) => setAdditionalQuantities((prev) => ({ ...prev, [id]: Number(e.target.value) }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </Section>

          {/* Additional Services */}
          <Section title="Additional Services">
            <DivineMultiSelect label="Additional Services" values={additionalServiceIds} onChange={setAdditionalServiceIds} options={serviceOptions} placeholder="None" />
            <DivineTextarea staticLabel label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Section>

          {/* Discount */}
          <Section title="Discount">
            <div className="grid grid-cols-3 gap-4">
              <DivineInput
                staticLabel
                label="Discount %"
                type="number"
                min={0}
                max={100}
                value={discountPercentage || ""}
                onChange={(e) => setDiscountPercentage(Number(e.target.value))}
              />
              <DivineInput staticLabel label="Membership Number" value={membershipNumber} onChange={(e) => setMembershipNumber(e.target.value)} />
              <DivineInput staticLabel label="Member Name" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
            </div>
          </Section>

          {/* Payment */}
          <Section title="Payment">
            <p className="text-[12.5px] text-ink-500">Zero-payment bookings are supported — leave the amount at 0 to book with nothing collected yet.</p>
            <div className="grid grid-cols-2 gap-4">
              <DivineListbox
                label="Payment Type"
                value={paymentType}
                onChange={(v) => setPaymentType(v as "" | "deposit" | "advance")}
                options={[
                  { value: "deposit", label: "Deposit" },
                  { value: "advance", label: "Advance" },
                ]}
              />
              <DivineInput staticLabel label="Amount" type="number" min={0} value={paymentAmount || ""} onChange={(e) => setPaymentAmount(Number(e.target.value))} />
            </div>
            {paymentAmount > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <DivineListbox label="Payment Mode" value={paymentModeId} onChange={setPaymentModeId} options={paymentModeOptions} placeholder="Select a mode…" />
                  {isNets && (
                    <DivineListbox
                      label="NETS Type"
                      value={paymentSubtype}
                      onChange={setPaymentSubtype}
                      options={[
                        { value: "QR", label: "QR" },
                        { value: "Debit Card", label: "Debit Card" },
                        { value: "Credit Card", label: "Credit Card" },
                      ]}
                    />
                  )}
                </div>
                <DivineInput staticLabel label="Transaction / Reference No." value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
                <DivineTextarea
                  staticLabel
                  label={isOther ? "Remarks (required for Other)" : "Remarks"}
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                />
              </>
            )}
          </Section>

          {submitError && <p className="text-[13px] text-crimson-500">{submitError}</p>}
          <DivineButton variant="flame" type="button" disabled={!canConfirm} loading={submitting} onClick={handleConfirm}>
            Confirm Booking
          </DivineButton>
        </div>

        {/* Pricing summary — sticky */}
        <div className="lg:sticky lg:top-6 lg:h-fit">
          <div className="rounded-2xl border border-gold-500/25 bg-white p-5">
            <p className="mb-3 font-display text-[18px] font-bold text-ink-100">Booking Summary</p>
            {pricingError && <p className="text-[12.5px] text-crimson-500">{pricingError}</p>}
            {!pricingIsFresh && !pricingError && <p className="text-[13px] text-ink-500">Fill in the Hall/Package and Event Details to see pricing.</p>}
            {pricingIsFresh && pricing && (
              <div className="space-y-1.5 text-[13.5px]">
                <Row label="Hall / Package Amount" value={pricing.hallAmount} />
                {pricing.additionalHourAmount > 0 && <Row label="Additional Hour Amount" value={pricing.additionalHourAmount} />}
                {foodRequired && <Row label="Food Amount" value={pricing.foodAmount} />}
                {pricing.foodAdjustmentAmount > 0 && <Row label="Additional Food Amount" value={pricing.foodAdjustmentAmount} />}
                <Row label="Subtotal" value={pricing.subtotalAmount} />
                {pricing.discountAmount > 0 && <Row label="Discount" value={-pricing.discountAmount} />}
                {pricing.gstAmount > 0 && <Row label={`GST (${pricing.gstPercentage}%)`} value={pricing.gstAmount} />}
                <div className="my-2 border-t border-gold-500/20" />
                <Row label="Final Booking Amount" value={pricing.finalAmount} bold />
                {pricing.depositAmount > 0 && <Row label="Deposit (applicable)" value={pricing.depositAmount} />}
                {paymentAmount > 0 && <Row label="Paying Now" value={paymentAmount} />}
                {paymentAmount > 0 && <Row label="Balance After This Payment" value={Math.max(0, pricing.finalAmount - paymentAmount)} bold />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-gold-500/20 bg-white p-5">
      <p className="font-display text-[17px] font-bold text-maroon">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold text-ink-100" : "text-ink-500"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}
