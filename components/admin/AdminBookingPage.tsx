"use client";

/**
 * Admin Booking Page
 *
 * Full booking flow for temple staff — mirrors the screenshot layout:
 *  Left panel  : Personal Details + Item/Service selector + cart lines
 *  Right panel : Cart Summary → totals → Proceed to Payment → confirm
 *
 * Flow:
 *  1. Look up / select a customer (search by name/email/mobile)
 *  2. Choose Item or Service, pick deity + devotees, Add to Cart
 *  3. Cart Summary calls POST /pos/booking/summary for live pricing
 *  4. "Proceed to Payment" shows only Cash (as requested)
 *  5. On "Confirm Booking":
 *       a. POST /pos/booking/orders        → creates order + reserves inventory
 *       b. POST /pos/booking/orders/:id/confirm → creates booking, stock-out
 *  6. Success state shows booking number + summary
 *
 * Inventory hold:
 *  - For inventory-applicable items/services the summary endpoint returns
 *    availableQty. If a cart line exceeds it the line is flagged red and
 *    the confirm button is disabled.
 *  - Reservation is placed at createOrder and released automatically after
 *    30 min by the backend cleanup job if the order is abandoned.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, unwrap, extractErrorMessage, type ApiEnvelope } from "../../lib/api";
import { toast } from "../../lib/toastStore";
import { MODULES, usePermissions } from "../../lib/permissions";
import DivineInput from "../divine/DivineInput";
import DivineButton from "../divine/DivineButton";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineMultiSelect from "../divine/DivineMultiSelect";
import {
  SearchIcon,
  TrashIcon,
  CartIcon,
  UserIcon,
  PhoneIcon,
  MailIcon,
  PlusIcon,
  CheckIcon,
} from "../divine/icons";

// ─── types ────────────────────────────────────────────────────────────────────

type Customer = {
  _id: string;
  customerCode: string;
  name: string;
  email: string;
  mobileNumber: string | null;
  familyMembers?: { name: string; nakshatra: string }[];
};

type InventoryInfo = {
  isApplicable: boolean;
  currentStock?: number;
  reservedQty?: number;
  availableQty?: number;
  threshold?: number;
};

type PosItem = {
  _id: string;
  code: string;
  name: string;
  salePrice: number;
  isDeityMappingRequired: boolean;
  deityMapping: { _id: string; name: string }[];
  isFamilyMembersRequired: boolean;
  maxFamilyMembers: number;
  minQuantity: number;
  maxQuantity: number;
  inventory: InventoryInfo;
};

type PosService = {
  _id: string;
  code: string;
  name: string;
  defaultSalePrice: number;
  isDeityMappingRequired: boolean;
  deityMapping: { _id: string; name: string }[];
  isFamilyMembersRequired: boolean;
  maxFamilyMembers: number;
  inventory: InventoryInfo;
};

type PaymentMode = { _id: string; name: string };

type Devotee = { name: string; nakshatra: string };

type CartLine = {
  id: string; // local key only
  refType: "Item" | "Service";
  refId: string;
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  deities: string[];
  devotees: Devotee[];
  // Filled in by summary API
  lineTotal?: number;
  lineGst?: number;
  inventory?: InventoryInfo;
  quantityExceedsStock?: boolean;
};

type SummaryLine = {
  refType: string;
  refId: string;
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  lineGst: number;
  inventory: InventoryInfo & { isApplicable: boolean };
  quantityExceedsStock: boolean;
};

type SummaryResponse = {
  customer: Customer;
  lines: SummaryLine[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  hasStockIssues: boolean;
};

type BookingConfirmation = {
  _id: string;
  bookingNumber: string;
  orderNumber: string;
  customer: Customer;
  lines: CartLine[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  paymentModeName: string;
  paymentStatus: string;
  bookingStatus: string;
  bookedAt: string;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

let lineCounter = 0;
function newLineId() {
  return `line-${++lineCounter}`;
}

function formatCurrency(v: number) {
  return `$${v.toFixed(2)}`;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AdminBookingPage() {
  const { can } = usePermissions();
  const canBook = can(MODULES.adminBooking, "fullAccess");

  // ── customer ────────────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // ── catalogue ───────────────────────────────────────────────────────────────
  const [refType, setRefType] = useState<"Item" | "Service">("Item");
  const [itemSearch, setItemSearch] = useState("");
  const [items, setItems] = useState<PosItem[]>([]);
  const [services, setServices] = useState<PosService[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);

  // ── add-to-cart form ────────────────────────────────────────────────────────
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedDeities, setSelectedDeities] = useState<string[]>([]);
  const [devotees, setDevotees] = useState<Devotee[]>([{ name: "", nakshatra: "" }]);

  // ── cart ────────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([]);

  // ── payment modes ───────────────────────────────────────────────────────────
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [selectedPaymentModeId, setSelectedPaymentModeId] = useState("");

  // ── summary ─────────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signature of just the fields that affect what the summary API returns.
  // The effect below writes lineTotal/lineGst/inventory/quantityExceedsStock
  // back onto `cart` from the response — if the effect depended on `cart`
  // directly, that write would produce a new array reference, re-trigger the
  // effect, re-fetch, re-write, forever. Two renders with the same input
  // fields produce the same string, and strings compare by value, so the
  // effect only re-runs when a line is actually added/removed/changed.
  const cartSignature = useMemo(
    () =>
      JSON.stringify(
        cart.map((l) => ({ refType: l.refType, refId: l.refId, quantity: l.quantity, deities: l.deities, devotees: l.devotees }))
      ),
    [cart]
  );

  // ── booking flow ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"cart" | "payment" | "done">("cart");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // ─── load payment modes once ─────────────────────────────────────────────
  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: PaymentMode[] }>>("/pos/booking/payment-modes")
      .then((r) => {
        const modes = unwrap(r).items;
        setPaymentModes(modes);
        // Pre-select Cash automatically
        const cash = modes.find((m) => m.name.toLowerCase() === "cash");
        if (cash) setSelectedPaymentModeId(cash._id);
      })
      .catch(() => {});
  }, []);

  // ─── nakshatra options — sourced from the real Nakshathiram master, not a
  // hardcoded list, so the dropdown always matches what's actually maintained
  // there. Scoped under /pos so booking staff don't also need that master's
  // own view permission. ────────────────────────────────────────────────────
  const [nakshatraOptions, setNakshatraOptions] = useState<ListboxOption[]>([]);
  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: { _id: string; name: string }[] }>>("/pos/booking/nakshathirams")
      .then((r) => setNakshatraOptions(unwrap(r).items.map((n) => ({ value: n.name, label: n.name }))))
      .catch(() => {});
  }, []);

  // ─── load catalogue ──────────────────────────────────────────────────────
  const loadCatalogue = useCallback(async () => {
    setCatalogueLoading(true);
    try {
      if (refType === "Item") {
        const r = await api.get<ApiEnvelope<{ items: PosItem[] }>>("/pos/booking/items", {
          params: { search: itemSearch || undefined, pageSize: 100 },
        });
        setItems(unwrap(r).items);
      } else {
        const r = await api.get<ApiEnvelope<{ items: PosService[] }>>("/pos/booking/services", {
          params: { search: itemSearch || undefined, pageSize: 100 },
        });
        setServices(unwrap(r).items);
      }
    } catch {
      // silent — catalogue failing shouldn't block the rest of the UI
    } finally {
      setCatalogueLoading(false);
    }
  }, [refType, itemSearch]);

  useEffect(() => {
    const t = setTimeout(loadCatalogue, 300);
    return () => clearTimeout(t);
  }, [loadCatalogue]);

  // Reset add-to-cart form when refType changes
  useEffect(() => {
    setSelectedItemId("");
    setSelectedServiceId("");
    setQuantity(1);
    setSelectedDeities([]);
    setDevotees([{ name: "", nakshatra: "" }]);
  }, [refType]);

  // ─── customer search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (customerQuery.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const r = await api.get<ApiEnvelope<{ items: Customer[] }>>("/pos/booking/customers/search", {
          params: { query: customerQuery.trim() },
        });
        setCustomerResults(unwrap(r).items);
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [customerQuery]);

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c);
    setCustomerQuery(c.name);
    setCustomerResults([]);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
    setCart([]);
    setSummary(null);
    setStep("cart");
  }

  // ─── summary refresh (debounced, triggered by cart/customer changes) ─────
  useEffect(() => {
    if (summaryDebounce.current) clearTimeout(summaryDebounce.current);

    if (!selectedCustomer || cart.length === 0) {
      setSummary(null);
      return;
    }

    summaryDebounce.current = setTimeout(async () => {
      setSummaryLoading(true);
      try {
        const r = await api.post<ApiEnvelope<SummaryResponse>>("/pos/booking/summary", {
          customerId: selectedCustomer._id,
          lines: cart.map((l) => ({
            refType: l.refType,
            refId: l.refId,
            quantity: l.quantity,
            deities: l.deities,
            devotees: l.devotees,
          })),
        });
        const data = unwrap(r);
        setSummary(data);

        // Merge availability info back into cart lines
        setCart((prev) =>
          prev.map((line) => {
            const sl = data.lines.find((d) => d.refId === line.refId && d.refType === line.refType);
            if (!sl) return line;
            return {
              ...line,
              lineTotal: sl.lineTotal,
              lineGst: sl.lineGst,
              inventory: sl.inventory,
              quantityExceedsStock: sl.quantityExceedsStock,
            };
          })
        );
      } catch (err) {
        toast.error(extractErrorMessage(err));
      } finally {
        setSummaryLoading(false);
      }
    }, 500);

    return () => {
      if (summaryDebounce.current) clearTimeout(summaryDebounce.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature, selectedCustomer]);

  // ─── derived values for add-to-cart form ─────────────────────────────────
  const selectedItem = items.find((i) => i._id === selectedItemId) ?? null;
  const selectedService = services.find((s) => s._id === selectedServiceId) ?? null;
  const currentRef = refType === "Item" ? selectedItem : selectedService;
  const unitPrice =
    refType === "Item" ? (selectedItem?.salePrice ?? 0) : (selectedService?.defaultSalePrice ?? 0);

  const curatedDeityMapping = refType === "Item" ? selectedItem?.deityMapping : selectedService?.deityMapping;
  const deityOptions: ListboxOption[] = curatedDeityMapping?.map((d) => ({ value: d._id, label: d.name })) ?? [];

  const needsDeity =
    refType === "Item"
      ? (selectedItem?.isDeityMappingRequired ?? false)
      : (selectedService?.isDeityMappingRequired ?? false);

  const needsDevotees =
    refType === "Item"
      ? (selectedItem?.isFamilyMembersRequired ?? false)
      : (selectedService?.isFamilyMembersRequired ?? false);

  const maxFamilyMembers =
    (refType === "Item" ? selectedItem?.maxFamilyMembers : selectedService?.maxFamilyMembers) ?? 1;

  // Deity-mapped lines are priced (and reserved) per selected deity, not a
  // separately-typed quantity — the backend enforces this too
  // (effectiveQuantity() in controllers/pos/index.js), so the two can never
  // disagree. A plain item/service with no deity concept keeps its own
  // quantity input.
  const effectiveQuantity = needsDeity ? selectedDeities.length : quantity;
  const lineTotal = unitPrice * effectiveQuantity;

  const deityCount = selectedDeities.length || 1;

  // Deity-mapped: one devotee row per selected deity. Family-only (no
  // deity): rows are grown/shrunk manually via addDevoteeRow/
  // removeDevoteeRow, starting at 1 and capped at the configured maximum —
  // there's no configured minimum any more.
  const devoteeRowCount = needsDevotees ? devotees.length : 0;

  useEffect(() => {
    if (!needsDevotees) {
      setDevotees([{ name: "", nakshatra: "" }]);
      return;
    }
    if (!needsDeity) return;
    setDevotees((prev) => {
      const rows = deityCount;
      if (prev.length === rows) return prev;
      if (prev.length < rows) return [...prev, ...Array(rows - prev.length).fill({ name: "", nakshatra: "" })];
      return prev.slice(0, rows);
    });
  }, [deityCount, needsDevotees, needsDeity]);

  function addDevoteeRow() {
    if (devotees.length >= maxFamilyMembers) return;
    setDevotees((prev) => [...prev, { name: "", nakshatra: "" }]);
  }

  function removeDevoteeRow(idx: number) {
    if (devotees.length <= 1) return;
    setDevotees((prev) => prev.filter((_, i) => i !== idx));
  }

  // Picking a different item/service starts a clean line: previous deity
  // selection and devotee rows don't carry over to an unrelated offering.
  useEffect(() => {
    setQuantity(1);
    setSelectedDeities([]);
    setDevotees([{ name: "", nakshatra: "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId, selectedServiceId]);

  // ─── add to cart ──────────────────────────────────────────────────────────
  function addToCart() {
    if (!selectedCustomer) {
      toast.error("Please select a customer first.");
      return;
    }
    const refId = refType === "Item" ? selectedItemId : selectedServiceId;
    if (!refId) {
      toast.error(`Please select an ${refType.toLowerCase()}.`);
      return;
    }
    if (quantity < 1) {
      toast.error("Quantity must be at least 1.");
      return;
    }
    if (needsDeity && selectedDeities.length === 0) {
      toast.error("Please select at least one deity.");
      return;
    }
    if (needsDevotees) {
      const empty = devotees.some((d) => !d.name.trim());
      if (empty) {
        toast.error("Please fill all devotee names.");
        return;
      }
    }

    const name = refType === "Item" ? (selectedItem?.name ?? "") : (selectedService?.name ?? "");
    const code = refType === "Item" ? (selectedItem?.code ?? "") : (selectedService?.code ?? "");

    const newLine: CartLine = {
      id: newLineId(),
      refType,
      refId,
      name,
      code,
      quantity: effectiveQuantity,
      unitPrice,
      deities: selectedDeities,
      devotees: needsDevotees ? devotees.map((d) => ({ name: d.name.trim(), nakshatra: d.nakshatra })) : [],
    };

    setCart((prev) => [...prev, newLine]);

    // Reset form
    setSelectedItemId("");
    setSelectedServiceId("");
    setQuantity(1);
    setSelectedDeities([]);
    setDevotees([{ name: "", nakshatra: "" }]);
  }

  function removeCartLine(id: string) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  function clearCart() {
    setCart([]);
    setSummary(null);
    setStep("cart");
  }

  // ─── booking confirmation ─────────────────────────────────────────────────
  async function handleConfirmBooking() {
    if (!canBook) { toast.error("You don't have permission to complete bookings."); return; }
    if (!selectedCustomer) { toast.error("No customer selected."); return; }
    if (cart.length === 0) { toast.error("Cart is empty."); return; }
    if (!selectedPaymentModeId) { toast.error("Please select a payment mode."); return; }
    if (summary?.hasStockIssues) { toast.error("Some items have insufficient stock. Please adjust quantities."); return; }

    setBookingLoading(true);
    try {
      // Step 1: create order
      const orderRes = await api.post<ApiEnvelope<{ _id: string; orderNumber: string }>>("/pos/booking/orders", {
        customerId: selectedCustomer._id,
        lines: cart.map((l) => ({
          refType: l.refType,
          refId: l.refId,
          quantity: l.quantity,
          deities: l.deities,
          devotees: l.devotees,
        })),
        paymentModeId: selectedPaymentModeId,
      });
      const order = unwrap(orderRes);

      // Step 2: immediately confirm (Cash payment)
      const confirmRes = await api.post<ApiEnvelope<BookingConfirmation>>(
        `/pos/booking/orders/${order._id}/confirm`,
        {}
      );
      const booking = unwrap(confirmRes);

      setConfirmation(booking);
      setStep("done");
      toast.created(`Booking ${booking.bookingNumber} confirmed!`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBookingLoading(false);
    }
  }

  // ─── reset entire page for a new booking ─────────────────────────────────
  function startNewBooking() {
    clearCustomer();
    setItemSearch("");
    setSelectedPaymentModeId("");
    setConfirmation(null);
    setStep("cart");
    lineCounter = 0;
    // Re-select Cash
    const cash = paymentModes.find((m) => m.name.toLowerCase() === "cash");
    if (cash) setSelectedPaymentModeId(cash._id);
  }

  const itemOptions: ListboxOption[] = items.map((i) => ({
    value: i._id,
    label: `${i.name} — ${formatCurrency(i.salePrice)}`,
  }));

  const serviceOptions: ListboxOption[] = services.map((s) => ({
    value: s._id,
    label: `${s.name} — ${formatCurrency(s.defaultSalePrice)}`,
  }));

  const hasStockIssues = cart.some((l) => l.quantityExceedsStock);
  const canProceed = canBook && selectedCustomer && cart.length > 0 && !hasStockIssues && !summaryLoading;

  // ─── done state ───────────────────────────────────────────────────────────
  if (step === "done" && confirmation) {
    return <BookingSuccessView confirmation={confirmation} onNewBooking={startNewBooking} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-display text-[28px] font-bold text-ink-100">Admin Booking</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Select a customer, add items or services, and complete the booking.
        </p>
      </div>

      {!canBook && (
        <p className="rounded-xl border border-crimson-500/30 bg-crimson-500/10 px-4 py-3 text-[13px] text-crimson-500">
          You have view-only access to Admin Booking — you can browse customers, items and services, but
          completing a booking requires full access.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Personal Details */}
          <Section title="Personal Details">
            <div className="relative">
              <DivineInput
                label="Search customer (name / email / mobile)"
                icon={<SearchIcon />}
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  if (selectedCustomer) clearCustomer();
                }}
                disabled={!!selectedCustomer}
              />
              {/* Dropdown results */}
              <AnimatePresence>
                {customerResults.length > 0 && !selectedCustomer && (
                  <motion.ul
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gold-500/20 bg-navy-900 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
                  >
                    {customerSearching && (
                      <li className="px-4 py-3 text-[13px] text-ink-500">Searching…</li>
                    )}
                    {customerResults.map((c) => (
                      <li
                        key={c._id}
                        onClick={() => selectCustomer(c)}
                        className="flex cursor-pointer items-start gap-3 border-b border-gold-500/10 px-4 py-3 last:border-0 hover:bg-ivory-100"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[12px] text-amber-600">
                          {c.name[0]?.toUpperCase()}
                        </span>
                        <div>
                          <p className="text-[13.5px] font-medium text-ink-100">{c.name}</p>
                          <p className="text-[12px] text-ink-500">
                            {c.customerCode} · {c.email}{c.mobileNumber ? ` · ${c.mobileNumber}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            {/* Selected customer card */}
            <AnimatePresence>
              {selectedCustomer && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start justify-between rounded-xl border border-gold-500/20 bg-gold-500/5 px-4 py-3"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-ink-100">{selectedCustomer.name}</p>
                    <p className="text-[12.5px] text-ink-500">
                      {selectedCustomer.customerCode}
                      {selectedCustomer.email && <> · <span className="inline-flex items-center gap-1"><MailIcon /> {selectedCustomer.email}</span></>}
                      {selectedCustomer.mobileNumber && <> · <span className="inline-flex items-center gap-1"><PhoneIcon /> {selectedCustomer.mobileNumber}</span></>}
                    </p>
                  </div>
                  <button
                    onClick={clearCustomer}
                    className="ml-3 rounded px-2 py-1 text-[12px] text-ink-500 hover:text-crimson-500"
                  >
                    Change
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* Item / Service selector */}
          <Section title="Select Item / Service and Add to Cart">
            {/* Type toggle */}
            <div className="flex gap-4">
              {(["Item", "Service"] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink-200">
                  <input
                    type="radio"
                    name="refType"
                    value={t}
                    checked={refType === t}
                    onChange={() => setRefType(t)}
                    className="accent-amber-600"
                  />
                  {t}
                </label>
              ))}
            </div>

            {/* Item / service search */}
            <div className="relative">
              <DivineInput
                label={refType === "Item" ? "Search items…" : "Search services…"}
                icon={<SearchIcon />}
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
              {catalogueLoading && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-ink-500">
                  Loading…
                </span>
              )}
            </div>

            {/* Item dropdown */}
            {refType === "Item" && (
              <DivineListbox
                label="Select Item"
                value={selectedItemId}
                onChange={setSelectedItemId}
                options={itemOptions}
                placeholder="— Choose an item —"
              />
            )}

            {/* Service dropdown */}
            {refType === "Service" && (
              <DivineListbox
                label="Select Service"
                value={selectedServiceId}
                onChange={setSelectedServiceId}
                options={serviceOptions}
                placeholder="— Choose a service —"
              />
            )}

            {/* Deity multi-select (if applicable) */}
            {needsDeity && currentRef && (
              <DivineMultiSelect
                label="Deities (Multi-Select)"
                values={selectedDeities}
                onChange={setSelectedDeities}
                options={deityOptions}
                placeholder="Select deities…"
              />
            )}

            {/* Devotee rows */}
            {needsDevotees && devotees.length > 0 && (
              <div className="space-y-3">
                <p className="text-[12.5px] text-ink-500">
                  {needsDeity
                    ? `Devotee details — ${devotees.length} row(s) · same devotees apply to all selected deities`
                    : `Devotee details (max ${maxFamilyMembers})`}
                </p>
                {devotees.map((devotee, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[1fr_180px_auto]">
                    <DivineInput
                      label={`Devotee ${idx + 1} Name`}
                      icon={<UserIcon />}
                      value={devotee.name}
                      onChange={(e) => {
                        const updated = [...devotees];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setDevotees(updated);
                      }}
                    />
                    <DivineListbox
                      label="Nakshatra"
                      value={devotee.nakshatra}
                      onChange={(v) => {
                        const updated = [...devotees];
                        updated[idx] = { ...updated[idx], nakshatra: v };
                        setDevotees(updated);
                      }}
                      options={nakshatraOptions}
                    />
                    {!needsDeity && devotees.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDevoteeRow(idx)}
                        aria-label="Remove family member"
                        className="pb-2.5 text-ink-500 hover:text-crimson-400"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                ))}
                {!needsDeity && devotees.length < maxFamilyMembers && (
                  <button
                    type="button"
                    onClick={addDevoteeRow}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-600 hover:underline"
                  >
                    <PlusIcon /> Add family member
                  </button>
                )}
              </div>
            )}

            {/* Quantity + unit price row — a deity-mapped offering has no
                separate quantity to type; the deity count above is the
                quantity, matching the backend's effectiveQuantity(). */}
            {currentRef && (
              <div className="flex flex-wrap items-end gap-4">
                {!needsDeity && (
                  <div className="w-32">
                    <DivineInput
                      label="Quantity"
                      type="number"
                      min={1}
                      value={String(quantity)}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                )}
                <div className="flex-1 space-y-0.5 text-[13px] text-ink-500">
                  <div className="flex justify-between">
                    <span>Unit Price</span>
                    <span className="font-medium text-ink-200">{formatCurrency(unitPrice)}</span>
                  </div>
                  {needsDeity && (
                    <div className="flex justify-between">
                      <span>Selected Deities</span>
                      <span className="font-medium text-ink-200">{selectedDeities.length}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gold-500/10 pt-1.5">
                    <span className="font-semibold text-ink-200">Total Amount</span>
                    <span className="font-bold text-amber-600">{formatCurrency(lineTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Stock warning for selected ref */}
            {currentRef && (() => {
              const inv = refType === "Item"
                ? selectedItem?.inventory
                : selectedService?.inventory;
              if (!inv?.isApplicable) return null;
              const avail = inv.availableQty ?? 0;
              if (effectiveQuantity <= avail) return null;
              return (
                <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-[12.5px] text-crimson-400">
                  Only {avail} unit(s) available for booking ({inv.currentStock} in stock, {inv.reservedQty} reserved, {inv.threshold} safety buffer).
                </p>
              );
            })()}

            {/* Add to Cart button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addToCart}
                disabled={!canBook || !selectedCustomer || !(selectedItemId || selectedServiceId)}
                className="flex items-center gap-2 rounded-xl border border-gold-600/25 bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 px-4 py-2.5 font-accent text-[13.5px] font-semibold text-navy-950 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(184,137,42,0.55)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CartIcon />
                Add to Cart
              </button>
            </div>
          </Section>

          {/* Cart lines */}
          {cart.length > 0 && (
            <Section title={`Cart Lines (${cart.length})`} action={
              <button onClick={clearCart} className="text-[12px] text-ink-500 hover:text-crimson-400">
                Clear All
              </button>
            }>
              <div className="divide-y divide-gold-500/10">
                {cart.map((line) => (
                  <CartLineRow
                    key={line.id}
                    line={line}
                    onRemove={() => removeCartLine(line.id)}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* ── RIGHT PANEL — Cart Summary ──────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border border-gold-500/15 bg-navy-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-[17px] font-bold text-ink-100">
                Cart Summary <span className="ml-1 text-[13px] font-normal text-ink-500">{cart.length} item(s)</span>
              </h2>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-[12px] text-ink-500 hover:text-crimson-400">
                  Clear Cart
                </button>
              )}
            </div>

            {/* Summary lines */}
            {summaryLoading && (
              <p className="py-4 text-center text-[13px] text-ink-500">Calculating…</p>
            )}

            {!summaryLoading && cart.length === 0 && (
              <p className="py-8 text-center text-[13px] text-ink-500">
                Add items or services to see the summary.
              </p>
            )}

            {!summaryLoading && summary && (
              <div className="space-y-3">
                {summary.lines.map((line, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2.5 text-[13px] ${line.quantityExceedsStock ? "border border-crimson-500/30 bg-crimson-500/5" : "bg-navy-800/60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink-100">{line.name}</p>
                        <p className="text-[12px] text-ink-500">{line.code} · {line.refType} · Qty {line.quantity}</p>
                        {line.quantityExceedsStock && (
                          <p className="mt-1 text-[11.5px] text-crimson-400">
                            ⚠ Exceeds available stock ({line.inventory?.availableQty ?? 0} available)
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap font-semibold text-amber-600">
                        {formatCurrency(line.lineTotal)}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="border-t border-gold-500/10 pt-3 space-y-1.5 text-[13px]">
                  <div className="flex justify-between text-ink-500">
                    <span>Sub Total (S$)</span>
                    <span>{formatCurrency(summary.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-ink-500">
                    <span>GST (S$)</span>
                    <span>{formatCurrency(summary.gstAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gold-500/10 pt-2 font-bold text-ink-100">
                    <span>Grand Total (S$)</span>
                    <span className="text-amber-500">{formatCurrency(summary.grandTotal)}</span>
                  </div>
                </div>

                {hasStockIssues && (
                  <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2.5 text-[12.5px] text-crimson-400">
                    One or more items exceed available stock. Adjust quantities before proceeding.
                  </p>
                )}
              </div>
            )}

            {/* Payment mode */}
            {step !== "cart" && (
              <div className="mt-4 space-y-3 border-t border-gold-500/10 pt-4">
                <h3 className="text-[13px] font-semibold text-ink-300">Payment Mode</h3>
                <div className="space-y-2">
                  {paymentModes
                    .filter((m) => m.name.toLowerCase() === "cash")
                    .map((m) => (
                      <label key={m._id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gold-500/20 bg-navy-800/60 px-4 py-3">
                        <input
                          type="radio"
                          name="paymentMode"
                          value={m._id}
                          checked={selectedPaymentModeId === m._id}
                          onChange={() => setSelectedPaymentModeId(m._id)}
                          className="accent-amber-600"
                        />
                        <span className="text-[13.5px] font-medium text-ink-100">{m.name}</span>
                      </label>
                    ))}
                </div>
                <p className="text-[12px] text-ink-500">
                  Cash payment is confirmed immediately upon booking.
                </p>
              </div>
            )}

            {/* Payment summary note when on cart step */}
            {step === "cart" && cart.length > 0 && !hasStockIssues && canProceed && (
              <p className="mt-4 text-center text-[12px] text-ink-500">
                Payment mode will be selected in the payment screen.
              </p>
            )}

            {/* The button below disables silently otherwise — this spells
                out exactly what's missing. Stock issues get their own
                message above already. */}
            {step === "cart" && !canProceed && !hasStockIssues && (
              <p className="mt-4 text-center text-[12px] text-crimson-400">
                {!canBook
                  ? "You don't have permission to complete bookings."
                  : !selectedCustomer
                    ? "Select a customer above to proceed."
                    : cart.length === 0
                      ? "Add an item or service to the cart to proceed."
                      : "Calculating totals…"}
              </p>
            )}

            {/* CTA buttons */}
            <div className="mt-5 space-y-3">
              {step === "cart" && (
                <DivineButton
                  fullWidth
                  onClick={() => setStep("payment")}
                  disabled={!canProceed}
                >
                  Proceed to Payment
                </DivineButton>
              )}

              {step === "payment" && (
                <>
                  <DivineButton
                    fullWidth
                    loading={bookingLoading}
                    disabled={bookingLoading || !selectedPaymentModeId || !canBook}
                    onClick={handleConfirmBooking}
                  >
                    Confirm Booking
                  </DivineButton>
                  <DivineButton
                    fullWidth
                    variant="ghost"
                    onClick={() => setStep("cart")}
                    disabled={bookingLoading}
                  >
                    Back
                  </DivineButton>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gold-500/15 bg-navy-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[16px] font-bold text-ink-100">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function CartLineRow({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  return (
    <div className={`flex items-start gap-3 py-3 ${line.quantityExceedsStock ? "text-crimson-400" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium text-ink-100 truncate">{line.name}</p>
        <p className="text-[12px] text-ink-500">
          {line.code} · {line.refType} · Qty {line.quantity}
          {line.devotees.length > 0 && ` · ${line.devotees.map((d) => d.name).join(", ")}`}
        </p>
        {line.quantityExceedsStock && (
          <p className="text-[11.5px] text-crimson-400">
            ⚠ Only {line.inventory?.availableQty ?? 0} available
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap text-[13.5px] font-semibold text-amber-600">
          {line.lineTotal !== undefined ? formatCurrency(line.lineTotal) : formatCurrency(line.unitPrice * line.quantity)}
        </span>
        <button
          onClick={onRemove}
          className="text-ink-500 transition-colors hover:text-crimson-400"
          aria-label={`Remove ${line.name}`}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function BookingSuccessView({
  confirmation,
  onNewBooking,
}: {
  confirmation: BookingConfirmation;
  onNewBooking: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-lg rounded-2xl border border-gold-500/20 bg-navy-900 p-8 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
      >
        {/* Checkmark */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10">
          <svg className="h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="font-display text-[24px] font-bold text-ink-100">Booking Confirmed!</h2>
        <p className="mt-1 text-[13px] text-ink-500">Payment received · Inventory updated</p>

        <div className="my-6 space-y-2 rounded-xl border border-gold-500/15 bg-navy-800/60 px-5 py-4 text-left text-[13px]">
          <Row label="Booking No." value={confirmation.bookingNumber} highlight />
          <Row label="Order No." value={confirmation.orderNumber} />
          <Row label="Customer" value={`${confirmation.customer.name} (${confirmation.customer.customerCode})`} />
          <Row label="Payment" value={`${confirmation.paymentModeName} — ${confirmation.paymentStatus}`} />
          <Row label="Items / Services" value={`${confirmation.lines.length} line(s)`} />
          <div className="border-t border-gold-500/10 pt-2">
            <Row label="Grand Total" value={formatCurrency(confirmation.grandTotal)} highlight />
          </div>
        </div>

        <div className="space-y-3">
          <DivineButton fullWidth onClick={onNewBooking}>
            <PlusIcon />
            New Booking
          </DivineButton>
        </div>
      </motion.div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className={highlight ? "font-bold text-amber-500" : "font-medium text-ink-100"}>{value}</span>
    </div>
  );
}
