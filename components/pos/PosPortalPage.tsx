"use client";

/**
 * POS Portal — the counter checkout screen at /pos.
 *
 * Distinct from Admin Booking (/admin/transactions/admin-booking): that
 * screen is a dropdown-driven form for staff working from the admin panel;
 * this one is a touch-friendly catalogue browser for a dedicated counter
 * terminal — categories on top, folders (sub-categories) drilled into for
 * their items/services, cart on the right. Both share the same backend
 * booking flow (summary → order → confirm) since a booking is a booking
 * regardless of which screen created it.
 *
 * Folder model: SubCategory carries no parent Category at the master level
 * (see backend models/sub-categories) — a (category, subCategory) pairing
 * only exists per item/service via categoryDetails. GET /pos/booking/catalogue
 * derives the folder tree from the live catalogue itself; picking a category
 * tab just filters that already-loaded folder list client-side (no refetch).
 *
 * Deity-wise pricing: for a deity-mapped offering, "quantity" is the number
 * of selected deities, not a separately-typed number — the backend enforces
 * this too (effectiveQuantity() in controllers/pos/index.js), so the two
 * can never disagree.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, unwrap, extractErrorMessage, type ApiEnvelope } from "../../lib/api";
import { toast } from "../../lib/toastStore";
import { useAuthStore, endSession } from "../../lib/authStore";
import { USER_TYPE_LABEL } from "../../lib/userTypes";
import TempleClock from "../admin/TempleClock";
import { formatTempleDateTime } from "../../lib/datetime";
import DivineInput from "../divine/DivineInput";
import DivineButton from "../divine/DivineButton";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineDatePicker from "../divine/DivineDatePicker";
import {
  SearchIcon,
  TrashIcon,
  CartIcon,
  UserIcon,
  PhoneIcon,
  MailIcon,
  PlusIcon,
  LogoutIcon,
  ChevronIcon,
  HistoryIcon,
  PrinterIcon,
} from "../divine/icons";

// ─── types ────────────────────────────────────────────────────────────────────

type Customer = {
  _id: string;
  customerCode: string;
  name: string;
  email: string;
  mobileNumber: string | null;
};

type InventoryInfo = {
  isApplicable: boolean;
  currentStock?: number;
  reservedQty?: number;
  availableQty?: number;
  threshold?: number;
};

type CategoryTab = { _id: string; name: string; color: string; count: number };
type Folder = {
  categoryId: string;
  categoryName: string;
  subCategoryId: string;
  subCategoryName: string;
  color: string | null;
  itemCount: number;
  serviceCount: number;
  total: number;
};

type PosItem = {
  _id: string;
  code: string;
  name: string;
  tamilName: string;
  salePrice: number;
  isDeityMappingRequired: boolean;
  deityMapping: DeityOption[];
  isFamilyMembersRequired: boolean;
  maxFamilyMembers: number;
  inventory: InventoryInfo;
};

type PosService = {
  _id: string;
  code: string;
  name: string;
  tamilName: string;
  defaultSalePrice: number;
  isDeityMappingRequired: boolean;
  deityMapping: DeityOption[];
  isFamilyMembersRequired: boolean;
  maxFamilyMembers: number;
  inventory: InventoryInfo;
};

type Offering =
  | ({ refType: "Item" } & PosItem)
  | ({ refType: "Service" } & Omit<PosService, "defaultSalePrice"> & { salePrice: number });

type DeityOption = { _id: string; name: string; tamilName: string };
type NakshatraOption = { _id: string; name: string };

type Devotee = { name: string; nakshatra: string };

type CartLine = {
  id: string;
  refType: "Item" | "Service";
  refId: string;
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  deities: string[];
  devotees: Devotee[];
  lineTotal?: number;
  inventory?: InventoryInfo;
  quantityExceedsStock?: boolean;
};

type SummaryLine = {
  refType: string;
  refId: string;
  name: string;
  code: string;
  quantity: number;
  lineTotal: number;
  inventory: InventoryInfo & { isApplicable: boolean };
  quantityExceedsStock: boolean;
};

type SummaryResponse = {
  lines: SummaryLine[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  hasStockIssues: boolean;
};

type PaymentMode = { _id: string; name: string };

type RecentBookingLine = {
  refType: "Item" | "Service";
  refId: string;
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  deities: DeityOption[];
  devotees: Devotee[];
  lineTotal: number;
};

type RecentBooking = {
  _id: string;
  bookingNumber: string;
  orderNumber: string | null;
  grandTotal: number;
  bookedAt: string;
  lines: RecentBookingLine[];
};

/** One line's outcome from POST /pos/booking/recheck-lines — `available`
 *  decides whether it can be re-added to the cart as-is. */
type RecheckedLine = {
  refType: "Item" | "Service";
  refId: string;
  quantity: number;
  deities: string[];
  devotees: Devotee[];
  available: boolean;
  name?: string;
  code?: string;
  unitPrice?: number;
  lineTotal?: number;
  reason?: string;
};

type BookingConfirmation = {
  bookingNumber: string;
  orderNumber: string;
  receiptNo: string;
  customer: Customer;
  lines: CartLine[];
  grandTotal: number;
  paymentModeName: string;
  paymentStatus: string;
};

let lineCounter = 0;
function newLineId() {
  return `line-${++lineCounter}`;
}

function formatCurrency(v: number) {
  return `$${v.toFixed(2)}`;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PosPortalPage() {
  const user = useAuthStore((s) => s.user);

  // ── customer ──────────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);

  // ── catalogue ────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<CategoryTab[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [uncategorizedItems, setUncategorizedItems] = useState<PosItem[]>([]);
  const [uncategorizedServices, setUncategorizedServices] = useState<PosService[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [activeFolder, setActiveFolder] = useState<Folder | null>(null);
  const [folderItems, setFolderItems] = useState<PosItem[]>([]);
  const [folderServices, setFolderServices] = useState<PosService[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [offeringSearch, setOfferingSearch] = useState("");
  const [searchItems, setSearchItems] = useState<PosItem[]>([]);
  const [searchServices, setSearchServices] = useState<PosService[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const totalOfferingCount = categories.reduce((sum, c) => sum + c.count, 0);

  async function loadCatalogue() {
    setCatalogueLoading(true);
    try {
      const r = await api.get<
        ApiEnvelope<{
          categories: CategoryTab[];
          folders: Folder[];
          uncategorizedItems: PosItem[];
          uncategorizedServices: PosService[];
        }>
      >("/pos/booking/catalogue");
      const data = unwrap(r);
      setCategories(data.categories);
      setFolders(data.folders);
      setUncategorizedItems(data.uncategorizedItems);
      setUncategorizedServices(data.uncategorizedServices);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setCatalogueLoading(false);
    }
  }

  useEffect(() => {
    loadCatalogue();
  }, []);

  const visibleFolders = useMemo(
    () => (selectedCategoryId ? folders.filter((f) => f.categoryId === selectedCategoryId) : folders),
    [folders, selectedCategoryId]
  );
  const visibleUncategorizedItems = selectedCategoryId ? [] : uncategorizedItems;
  const visibleUncategorizedServices = selectedCategoryId ? [] : uncategorizedServices;

  function openFolder(folder: Folder) {
    setActiveFolder(folder);
    setOfferingSearch("");
  }

  useEffect(() => {
    if (!activeFolder) return;
    setFolderLoading(true);
    Promise.all([
      api.get<ApiEnvelope<{ items: PosItem[] }>>("/pos/booking/items", {
        params: { category: activeFolder.categoryId, subCategory: activeFolder.subCategoryId, pageSize: 100 },
      }),
      api.get<ApiEnvelope<{ items: PosService[] }>>("/pos/booking/services", {
        params: { category: activeFolder.categoryId, subCategory: activeFolder.subCategoryId, pageSize: 100 },
      }),
    ])
      .then(([itemsRes, servicesRes]) => {
        setFolderItems(unwrap(itemsRes).items);
        setFolderServices(unwrap(servicesRes).items);
      })
      .catch((err) => toast.error(extractErrorMessage(err)))
      .finally(() => setFolderLoading(false));
  }, [activeFolder]);

  // Typing in the top search bar overrides folder browsing — search the
  // whole catalogue (optionally still narrowed by the selected category tab).
  useEffect(() => {
    if (!offeringSearch.trim()) {
      setSearchItems([]);
      setSearchServices([]);
      return;
    }
    setActiveFolder(null);
    const t = setTimeout(() => {
      setSearchLoading(true);
      Promise.all([
        api.get<ApiEnvelope<{ items: PosItem[] }>>("/pos/booking/items", {
          params: { search: offeringSearch, category: selectedCategoryId || undefined, pageSize: 50 },
        }),
        api.get<ApiEnvelope<{ items: PosService[] }>>("/pos/booking/services", {
          params: { search: offeringSearch, category: selectedCategoryId || undefined, pageSize: 50 },
        }),
      ])
        .then(([itemsRes, servicesRes]) => {
          setSearchItems(unwrap(itemsRes).items);
          setSearchServices(unwrap(servicesRes).items);
        })
        .catch((err) => toast.error(extractErrorMessage(err)))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [offeringSearch, selectedCategoryId]);

  // ── deity / nakshatra masters ───────────────────────────────────────────
  const [deityOptions, setDeityOptions] = useState<DeityOption[]>([]);
  const [nakshatraOptions, setNakshatraOptions] = useState<ListboxOption[]>([]);

  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: DeityOption[] }>>("/pos/booking/deities")
      .then((r) => setDeityOptions(unwrap(r).items))
      .catch(() => {});
    api
      .get<ApiEnvelope<{ items: NakshatraOption[] }>>("/pos/booking/nakshathirams")
      .then((r) => setNakshatraOptions(unwrap(r).items.map((n) => ({ value: n.name, label: n.name }))))
      .catch(() => {});
  }, []);

  // ── payment modes ───────────────────────────────────────────────────────
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [selectedPaymentModeId, setSelectedPaymentModeId] = useState("");

  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: PaymentMode[] }>>("/pos/booking/payment-modes")
      .then((r) => {
        const modes = unwrap(r).items;
        setPaymentModes(modes);
        const cash = modes.find((m) => m.name.toLowerCase() === "cash");
        if (cash) setSelectedPaymentModeId(cash._id);
      })
      .catch(() => {});
  }, []);

  // ── cart ────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signature of just the fields that actually change what the summary API
  // should return. The effect below writes lineTotal/inventory/
  // quantityExceedsStock back onto `cart` from the response — if the effect
  // depended on `cart` directly, that write would produce a new array
  // reference, re-trigger the effect, re-fetch, re-write, forever (this was
  // a real bug: the Network tab showed /pos/booking/summary firing in an
  // endless loop). Two renders with the same input fields produce the exact
  // same string, and primitive strings compare by value, so the effect only
  // re-runs when a line is actually added/removed/changed by the user.
  const cartSignature = useMemo(
    () =>
      JSON.stringify(
        cart.map((l) => ({ refType: l.refType, refId: l.refId, quantity: l.quantity, deities: l.deities, devotees: l.devotees }))
      ),
    [cart]
  );

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
        setCart((prev) =>
          prev.map((line) => {
            const sl = data.lines.find((d) => d.refId === line.refId && d.refType === line.refType);
            if (!sl) return line;
            return { ...line, lineTotal: sl.lineTotal, inventory: sl.inventory, quantityExceedsStock: sl.quantityExceedsStock };
          })
        );
      } catch (err) {
        toast.error(extractErrorMessage(err));
      } finally {
        setSummaryLoading(false);
      }
    }, 400);
    return () => {
      if (summaryDebounce.current) clearTimeout(summaryDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature, selectedCustomer]);

  // ── customer search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (customerQuery.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.get<ApiEnvelope<{ items: Customer[] }>>("/pos/booking/customers/search", {
          params: { query: customerQuery.trim() },
        });
        setCustomerResults(unwrap(r).items);
      } catch {
        setCustomerResults([]);
      }
    }, 300);
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
    setRecentBookings([]);
  }

  // ── recent transactions (repeat a past booking) ─────────────────────────
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [viewingRecentBooking, setViewingRecentBooking] = useState<RecentBooking | null>(null);
  const [recheckingCart, setRecheckingCart] = useState(false);
  const [unavailableLines, setUnavailableLines] = useState<RecheckedLine[] | null>(null);
  const [pendingAvailableLines, setPendingAvailableLines] = useState<RecheckedLine[]>([]);

  useEffect(() => {
    if (!selectedCustomer) {
      setRecentBookings([]);
      return;
    }
    api
      .get<ApiEnvelope<{ items: RecentBooking[] }>>(`/pos/booking/customers/${selectedCustomer._id}/recent-bookings`, {
        params: { limit: 3 },
      })
      .then((r) => setRecentBookings(unwrap(r).items))
      .catch(() => setRecentBookings([]));
  }, [selectedCustomer]);

  /** Re-adds a past booking's lines — checks live availability first via
   *  recheck-lines, then either adds everything straight to the cart or,
   *  if some lines are no longer valid, opens a confirmation dialog so
   *  staff can proceed with just what's still available. */
  async function addRecentBookingToCart(booking: RecentBooking) {
    setRecheckingCart(true);
    try {
      const r = await api.post<ApiEnvelope<{ lines: RecheckedLine[] }>>("/pos/booking/recheck-lines", {
        lines: booking.lines.map((l) => ({
          refType: l.refType,
          refId: l.refId,
          quantity: l.quantity,
          deities: l.deities.map((d) => d._id),
          devotees: l.devotees,
        })),
      });
      const { lines } = unwrap(r);
      const available = lines.filter((l) => l.available);
      const unavailable = lines.filter((l) => !l.available);

      if (unavailable.length === 0) {
        appendRecheckedLinesToCart(available);
        setViewingRecentBooking(null);
        toast.created(`${available.length} item(s) added to cart.`);
        return;
      }

      // Some lines can't be re-added as-is — let staff decide rather than
      // silently dropping them or failing the whole re-order.
      setPendingAvailableLines(available);
      setUnavailableLines(unavailable);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setRecheckingCart(false);
    }
  }

  function appendRecheckedLinesToCart(lines: RecheckedLine[]) {
    const newLines: CartLine[] = lines.map((l) => ({
      id: newLineId(),
      refType: l.refType,
      refId: l.refId,
      name: l.name ?? "",
      code: l.code ?? "",
      quantity: l.quantity,
      unitPrice: l.unitPrice ?? 0,
      deities: l.deities,
      devotees: l.devotees,
    }));
    setCart((prev) => [...prev, ...newLines]);
  }

  function confirmAddAvailableOnly() {
    if (pendingAvailableLines.length > 0) {
      appendRecheckedLinesToCart(pendingAvailableLines);
      toast.created(`${pendingAvailableLines.length} available item(s) added to cart.`);
    }
    setUnavailableLines(null);
    setPendingAvailableLines([]);
    setViewingRecentBooking(null);
  }

  // ── add-to-cart modal ───────────────────────────────────────────────────
  const [modalOffering, setModalOffering] = useState<Offering | null>(null);
  const [modalDeities, setModalDeities] = useState<string[]>([]);
  const [modalDevotees, setModalDevotees] = useState<Devotee[]>([{ name: "", nakshatra: "" }]);
  const [modalQuantity, setModalQuantity] = useState(1);

  function openAddModal(offering: Offering) {
    setModalOffering(offering);
    setModalDeities([]);
    // Family member details are their own independent count (the offering's
    // configured max), not tied to how many deities get picked — selecting
    // more deities only changes price/quantity, never how many devotee rows
    // show. Starts fully populated at the configured maximum (so "Max
    // Members: 2" actually shows 2 fields up front, not 1 with a hidden
    // add button) and can be shrunk via removeDevoteeRow down to a floor of 1.
    const startRows = offering.isFamilyMembersRequired ? Math.max(1, offering.maxFamilyMembers || 1) : 1;
    setModalDevotees(Array.from({ length: startRows }, () => ({ name: "", nakshatra: "" })));
    setModalQuantity(1);
  }

  const modalDevoteeRows = modalOffering?.isFamilyMembersRequired ? modalDevotees.length : 0;
  // Deity-mapped offerings: full active roster unless the offering has its
  // own curated deityMapping, in which case that takes precedence.
  const modalDeityChoices = modalOffering?.deityMapping?.length ? modalOffering.deityMapping : deityOptions;

  function addDevoteeRow() {
    if (!modalOffering) return;
    const max = modalOffering.maxFamilyMembers || modalDevotees.length + 1;
    if (modalDevotees.length >= max) return;
    setModalDevotees((prev) => [...prev, { name: "", nakshatra: "" }]);
  }

  function removeDevoteeRow(idx: number) {
    if (modalDevotees.length <= 1) return;
    setModalDevotees((prev) => prev.filter((_, i) => i !== idx));
  }

  const modalEffectiveQty = modalOffering?.isDeityMappingRequired
    ? modalDeities.length || 0
    : modalQuantity;
  const modalTotal = modalOffering
    ? modalOffering.salePrice * (modalOffering.isDeityMappingRequired ? modalDeities.length || 0 : modalQuantity)
    : 0;

  function confirmAddToCart() {
    if (!modalOffering) return;
    if (modalOffering.isDeityMappingRequired && modalDeities.length === 0) {
      toast.error("Please select at least one deity.");
      return;
    }
    // Devotee name is optional, not required — the row count reflects the
    // offering's configured max as a cap, not a mandatory headcount. Blank
    // rows (an unused slot) are simply dropped rather than blocking Add to
    // Cart or being sent to the backend, which rejects an empty name.
    const filledDevotees = modalDevotees
      .filter((d) => d.name.trim())
      .map((d) => ({ name: d.name.trim(), nakshatra: d.nakshatra }));

    const newLine: CartLine = {
      id: newLineId(),
      refType: modalOffering.refType,
      refId: modalOffering._id,
      name: modalOffering.name,
      code: modalOffering.code,
      quantity: modalEffectiveQty || 1,
      unitPrice: modalOffering.salePrice,
      deities: modalDeities,
      devotees: modalOffering.isFamilyMembersRequired ? filledDevotees : [],
    };
    setCart((prev) => [...prev, newLine]);
    setModalOffering(null);
    toast.created(`${modalOffering.name} added to cart.`);
  }

  function removeCartLine(id: string) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  function clearCart() {
    setCart([]);
    setSummary(null);
  }

  // ── checkout flow ────────────────────────────────────────────────────────
  const [step, setStep] = useState<"cart" | "payment" | "done">("cart");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const hasStockIssues = cart.some((l) => l.quantityExceedsStock);
  const canProceed = selectedCustomer && cart.length > 0 && !hasStockIssues && !summaryLoading;
  // Items are sitting in the cart with nobody to book them for — call it
  // out right at the search box instead of only at the disabled checkout
  // button, which is easy to miss until the very end.
  const needsCustomerForCart = cart.length > 0 && !selectedCustomer;

  async function handleConfirmBooking() {
    if (!selectedCustomer) { toast.error("No customer selected."); return; }
    if (cart.length === 0) { toast.error("Cart is empty."); return; }
    if (!selectedPaymentModeId) { toast.error("Please select a payment mode."); return; }
    if (summary?.hasStockIssues) { toast.error("Some items have insufficient stock. Please adjust quantities."); return; }

    setBookingLoading(true);
    try {
      const orderRes = await api.post<ApiEnvelope<{ _id: string; orderNumber: string }>>("/pos/booking/orders", {
        customerId: selectedCustomer._id,
        lines: cart.map((l) => ({ refType: l.refType, refId: l.refId, quantity: l.quantity, deities: l.deities, devotees: l.devotees })),
        paymentModeId: selectedPaymentModeId,
      });
      const order = unwrap(orderRes);
      const confirmRes = await api.post<ApiEnvelope<BookingConfirmation>>(`/pos/booking/orders/${order._id}/confirm`, {});
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

  function startNewTransaction() {
    clearCustomer();
    setCart([]);
    setSummary(null);
    setActiveFolder(null);
    setOfferingSearch("");
    setSelectedCategoryId("");
    setStep("cart");
    setConfirmation(null);
    lineCounter = 0;
    const cash = paymentModes.find((m) => m.name.toLowerCase() === "cash");
    setSelectedPaymentModeId(cash?._id ?? "");
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (step === "done" && confirmation) {
    return (
      <PosShell user={user}>
        <BookingSuccessView confirmation={confirmation} onNewTransaction={startNewTransaction} />
      </PosShell>
    );
  }

  const showingSearch = offeringSearch.trim().length > 0;
  const showingFolder = !showingSearch && activeFolder;

  return (
    <PosShell user={user} onNewTransaction={startNewTransaction}>
      <div className="grid grid-cols-1 gap-4 p-4 lg:h-full lg:grid-cols-[260px_1fr_360px]">
        {/* ── LEFT: customer panel ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3 rounded-2xl border border-gold-500/15 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] lg:h-full lg:overflow-y-auto">
          <p className="font-display text-[15px] font-bold text-ink-100">Customer</p>
          <div className={`relative rounded-xl transition-shadow duration-300 ${needsCustomerForCart ? "shadow-[0_0_0_3px_rgba(220,38,38,0.25)]" : ""}`}>
            <AnimatePresence>
              {needsCustomerForCart && (
                <>
                  {/* Colorful expanding wave rings — three staggered rings in
                      alternating gold/crimson/amber ripple outward from the
                      search box and fade, drawing the eye without a static shadow. */}
                  <div className="pointer-events-none absolute inset-0 z-0 overflow-visible rounded-xl">
                    {[
                      { color: "#dc2626", delay: 0 },
                      { color: "#d4af37", delay: 0.5 },
                      { color: "#f59e0b", delay: 1 },
                    ].map(({ color, delay }, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0.65, scale: 1 }}
                        animate={{ opacity: [0.65, 0], scale: [1, 1.4] }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.8, delay, ease: "easeOut" }}
                        className="absolute inset-0 rounded-xl border-2"
                        style={{ borderColor: color }}
                      />
                    ))}
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: [0, -6, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ y: { repeat: Infinity, duration: 1.1, ease: "easeInOut" }, opacity: { duration: 0.2 } }}
                    className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2"
                  >
                    <svg className="h-7 w-7 drop-shadow-[0_2px_5px_rgba(220,38,38,0.45)]" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                      <defs>
                        <linearGradient id="customerArrowGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#dc2626" />
                          <stop offset="100%" stopColor="#d4af37" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M12 3v15M12 18l-5-5M12 18l5-5"
                        stroke="url(#customerArrowGradient)"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            <DivineInput
              label="Search customer…"
              icon={<SearchIcon />}
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                if (selectedCustomer) clearCustomer();
              }}
              disabled={!!selectedCustomer}
            />
            <AnimatePresence>
              {customerResults.length > 0 && !selectedCustomer && (
                <motion.ul
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gold-500/20 bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)]"
                >
                  {customerResults.map((c) => (
                    <li
                      key={c._id}
                      onClick={() => selectCustomer(c)}
                      className="cursor-pointer border-b border-gold-500/10 px-3 py-2.5 last:border-0 hover:bg-ivory-100"
                    >
                      <p className="text-[13px] font-medium text-ink-100">{c.name}</p>
                      <p className="text-[11.5px] text-ink-500">
                        {c.customerCode}
                        {c.mobileNumber ? ` · ${c.mobileNumber}` : ""}
                      </p>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          {selectedCustomer ? (
            <div className="space-y-1 rounded-xl border border-gold-500/20 bg-gold-500/5 px-3 py-2.5">
              <p className="text-[13px] font-medium text-ink-100">{selectedCustomer.name}</p>
              <p className="text-[11.5px] text-ink-500">{selectedCustomer.customerCode}</p>
              {selectedCustomer.mobileNumber && (
                <p className="flex items-center gap-1 text-[11.5px] text-ink-500">
                  <PhoneIcon /> {selectedCustomer.mobileNumber}
                </p>
              )}
              <button onClick={clearCustomer} className="text-[11.5px] text-crimson-500 hover:underline">
                Change customer
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreateCustomerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold-500/25 bg-white px-3 py-2.5 text-[13px] font-medium text-amber-700 hover:border-gold-400/60 hover:bg-gold-500/5"
            >
              <UserIcon /> Create Customer
            </button>
          )}

          {selectedCustomer && recentBookings.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-600">
                <HistoryIcon /> Recent Transactions
              </p>
              {recentBookings.map((b) => (
                <button
                  key={b._id}
                  type="button"
                  onClick={() => setViewingRecentBooking(b)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-gold-500/15 bg-white px-3 py-2.5 text-left hover:border-gold-400/50 hover:bg-ivory-100"
                >
                  <span className="flex w-full items-center justify-between text-[12.5px] font-medium text-ink-100">
                    <span className="tabular-nums">{b.bookingNumber}</span>
                    <span className="text-amber-600">{formatCurrency(b.grandTotal)}</span>
                  </span>
                  <span className="text-[11px] text-ink-500">{formatTempleDateTime(b.bookedAt)} · {b.lines.length} item(s)</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── CENTER: catalogue ────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gold-500/15 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] lg:h-full">
          <div className="space-y-3 border-b border-gold-500/10 p-4">
            <DivineInput
              label="Search offerings…"
              icon={<SearchIcon />}
              value={offeringSearch}
              onChange={(e) => setOfferingSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSelectedCategoryId("");
                  setActiveFolder(null);
                }}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  !selectedCategoryId
                    ? "border-gold-500 bg-gold-500/20 text-amber-800"
                    : "border-gold-500/20 text-ink-300 hover:bg-ivory-100"
                }`}
              >
                All Categories ({totalOfferingCount})
              </button>
              {categories.map((c) => (
                <button
                  key={c._id}
                  onClick={() => {
                    setSelectedCategoryId(c._id);
                    setActiveFolder(null);
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    selectedCategoryId === c._id
                      ? "border-gold-500 bg-gold-500/20 text-amber-800"
                      : "border-gold-500/20 text-ink-300 hover:bg-ivory-100"
                  }`}
                >
                  {c.name} ({c.count})
                </button>
              ))}
            </div>
          </div>

          <div className="bg-ivory-50/60 p-4 lg:flex-1 lg:overflow-y-auto">
            {catalogueLoading && <p className="py-12 text-center text-[13px] text-ink-500">Loading catalogue…</p>}

            {!catalogueLoading && showingSearch && (
              <>
                {searchLoading && <p className="py-8 text-center text-[13px] text-ink-500">Searching…</p>}
                {!searchLoading && searchItems.length === 0 && searchServices.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-ink-500">No offerings match &ldquo;{offeringSearch}&rdquo;.</p>
                )}
                {!searchLoading && (searchItems.length > 0 || searchServices.length > 0) && (
                  <OfferingGrid items={searchItems} services={searchServices} onPick={openAddModal} />
                )}
              </>
            )}

            {!catalogueLoading && !showingSearch && showingFolder && activeFolder && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <FolderIcon />
                  <p className="font-display text-[16px] font-bold text-ink-100">{activeFolder.subCategoryName}</p>
                  <button onClick={() => setActiveFolder(null)} className="ml-2 text-[12.5px] text-crimson-500 hover:underline">
                    Back
                  </button>
                </div>
                {folderLoading ? (
                  <p className="py-8 text-center text-[13px] text-ink-500">Loading…</p>
                ) : (
                  <OfferingGrid items={folderItems} services={folderServices} onPick={openAddModal} />
                )}
              </div>
            )}

            {!catalogueLoading && !showingSearch && !showingFolder && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleFolders.map((f) => (
                  <button
                    key={`${f.categoryId}::${f.subCategoryId}`}
                    onClick={() => openFolder(f)}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-gold-500/15 bg-white p-4 text-center transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.15)]"
                  >
                    <span className="flex h-16 w-full items-center justify-center rounded-xl bg-ivory-100">
                      <FolderIcon large />
                    </span>
                    <span className="text-[13px] font-medium text-ink-100">{f.subCategoryName}</span>
                    <span className="rounded-full border border-gold-500/25 bg-gold-500/10 px-2 py-0.5 text-[10.5px] text-amber-700">
                      Folder
                    </span>
                    <span className="text-[11px] text-ink-500">{f.total} offering(s)</span>
                  </button>
                ))}
                {visibleUncategorizedServices.map((s) => (
                  <OfferingCard key={s._id} offering={{ refType: "Service", salePrice: s.defaultSalePrice, ...s }} onPick={openAddModal} />
                ))}
                {visibleUncategorizedItems.map((i) => (
                  <OfferingCard key={i._id} offering={{ refType: "Item", ...i }} onPick={openAddModal} />
                ))}
                {visibleFolders.length === 0 && visibleUncategorizedItems.length === 0 && visibleUncategorizedServices.length === 0 && (
                  <p className="col-span-full py-12 text-center text-[13px] text-ink-500">No offerings in this category yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: cart ──────────────────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-gold-500/15 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] lg:h-full">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 font-display text-[15px] font-bold text-ink-100">
              <CartIcon /> Cart <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-[11px] text-amber-700">{cart.length}</span>
            </p>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-[12px] text-ink-500 hover:text-crimson-400">
                Clear Cart
              </button>
            )}
          </div>

          <div className="lg:flex-1 lg:overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                <CartIcon />
                <p className="text-[13px] font-medium text-ink-300">No items or services added</p>
                <p className="text-[11.5px] text-ink-500">Select an offering to begin the transaction.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((line) => (
                  <CartLineRow key={line.id} line={line} onRemove={() => removeCartLine(line.id)} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2 border-t border-gold-500/10 pt-3 text-[13px]">
            <div className="flex justify-between text-ink-500">
              <span>Sub Total (S$)</span>
              <span>{formatCurrency(summary?.subtotal ?? 0)}</span>
            </div>
            <div className="flex justify-between text-ink-500">
              <span>GST (S$)</span>
              <span>{formatCurrency(summary?.gstAmount ?? 0)}</span>
            </div>
            <div className="flex justify-between border-t border-gold-500/10 pt-2 font-bold text-ink-100">
              <span>Total Payable (S$)</span>
              <span className="text-amber-600">{formatCurrency(summary?.grandTotal ?? 0)}</span>
            </div>
          </div>

          {hasStockIssues && (
            <p className="mt-2 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-[11.5px] text-crimson-500">
              One or more lines exceed available stock.
            </p>
          )}

          {/* The button below disables silently otherwise — this spells out
              exactly what's missing so "why can't I proceed" never needs a
              guess. Stock issues already get their own message above. */}
          {!canProceed && !hasStockIssues && (
            <p className="mt-2 text-center text-[11.5px] text-crimson-500">
              {!selectedCustomer
                ? "Select a customer above to proceed."
                : cart.length === 0
                  ? "Add an item or service to the cart to proceed."
                  : "Calculating totals…"}
            </p>
          )}

          <div className="mt-3 space-y-2">
            <DivineButton fullWidth onClick={() => setStep("payment")} disabled={!canProceed}>
              Proceed to Payment
            </DivineButton>
          </div>
        </div>
      </div>

      {createCustomerOpen && (
        <CreateCustomerModal
          onClose={() => setCreateCustomerOpen(false)}
          onCreated={(c) => {
            selectCustomer(c);
            setCreateCustomerOpen(false);
          }}
        />
      )}

      {viewingRecentBooking && (
        <RecentBookingModal
          booking={viewingRecentBooking}
          loading={recheckingCart}
          onClose={() => setViewingRecentBooking(null)}
          onAddToCart={() => addRecentBookingToCart(viewingRecentBooking)}
        />
      )}

      {unavailableLines && (
        <UnavailableLinesDialog
          unavailableLines={unavailableLines}
          availableCount={pendingAvailableLines.length}
          onCancel={() => {
            setUnavailableLines(null);
            setPendingAvailableLines([]);
          }}
          onProceed={confirmAddAvailableOnly}
        />
      )}

      {modalOffering && (
        <AddToCartModal
          offering={modalOffering}
          deityOptions={modalDeityChoices}
          nakshatraOptions={nakshatraOptions}
          deities={modalDeities}
          onDeitiesChange={setModalDeities}
          devotees={modalDevotees}
          onDevoteesChange={setModalDevotees}
          devoteeRows={modalDevoteeRows}
          onAddDevotee={addDevoteeRow}
          onRemoveDevotee={removeDevoteeRow}
          quantity={modalQuantity}
          onQuantityChange={setModalQuantity}
          total={modalTotal}
          onCancel={() => setModalOffering(null)}
          onConfirm={confirmAddToCart}
        />
      )}

      {step === "payment" && (
        <PaymentModal
          paymentModes={paymentModes}
          selectedPaymentModeId={selectedPaymentModeId}
          onSelectPaymentMode={setSelectedPaymentModeId}
          subtotal={summary?.subtotal ?? 0}
          gstAmount={summary?.gstAmount ?? 0}
          grandTotal={summary?.grandTotal ?? 0}
          loading={bookingLoading}
          onConfirm={handleConfirmBooking}
          onCancel={() => setStep("cart")}
        />
      )}
    </PosShell>
  );
}

// ─── shell (top bar) ──────────────────────────────────────────────────────────

function PosShell({
  user,
  onNewTransaction,
  children,
}: {
  user: ReturnType<typeof useAuthStore.getState>["user"];
  onNewTransaction?: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-ivory-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gold-500/15 bg-white px-3 py-2.5 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.1)] sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center">
          <img
            src="/SSD_Full_Logo.png"
            alt="Sri Siva Durga Temple"
            className="h-12 w-auto max-w-[220px] shrink-0 object-contain sm:h-14 sm:max-w-[260px] lg:h-[60px] lg:max-w-[300px]"
          />
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button
            onClick={() => toast.error("Transaction History isn't built yet.")}
            className="flex items-center gap-1.5 rounded-lg border border-gold-500/25 px-3 py-2 text-[12.5px] font-medium text-ink-300 hover:border-gold-400/60 hover:bg-ivory-100"
          >
            <HistoryIcon /> Transaction History
          </button>
          <button
            onClick={() => toast.error("Reprint isn't built yet.")}
            className="flex items-center gap-1.5 rounded-lg border border-gold-500/25 px-3 py-2 text-[12.5px] font-medium text-ink-300 hover:border-gold-400/60 hover:bg-ivory-100"
          >
            <PrinterIcon /> Reprint
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={onNewTransaction}
            className="flex items-center gap-1.5 rounded-lg bg-crimson-500/10 px-2.5 py-2 text-[12.5px] font-medium text-crimson-500 hover:bg-crimson-500/15 sm:px-3"
          >
            <PlusIcon /> <span className="hidden sm:inline">New Transaction</span>
          </button>
          <div className="hidden sm:block">
            <TempleClock />
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-ivory-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-crimson-500 text-[12px] font-semibold text-white">
                {user ? initials(user.name) : "?"}
              </span>
              <span className="hidden text-left lg:block">
                <span className="block text-[12.5px] leading-tight text-ink-100">{user?.name ?? "Unknown"}</span>
                <span className="block text-[10.5px] leading-tight text-ink-500">{user ? USER_TYPE_LABEL[user.userType] ?? user.userType : ""}</span>
              </span>
              <ChevronIcon className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute right-0 top-[calc(100%+8px)] z-30 w-44 overflow-hidden rounded-xl border border-gold-500/20 bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)]"
                >
                  <button
                    onClick={() => endSession("signed-out")}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] text-ink-300 hover:bg-crimson-500/10 hover:text-crimson-500"
                  >
                    <LogoutIcon /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">{children}</main>
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function FolderIcon({ large }: { large?: boolean }) {
  const size = large ? "h-8 w-8" : "h-4 w-4";
  return (
    <svg className={`${size} text-amber-600`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinejoin="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="h-8 w-8 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function BoxGlyph() {
  return (
    <svg className="h-8 w-8 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function OfferingGrid({
  items,
  services,
  onPick,
}: {
  items: PosItem[];
  services: PosService[];
  onPick: (o: Offering) => void;
}) {
  // Items first, then services — matches the requested list order.
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((i) => (
        <OfferingCard key={i._id} offering={{ refType: "Item", ...i }} onPick={onPick} />
      ))}
      {services.map((s) => (
        <OfferingCard key={s._id} offering={{ refType: "Service", salePrice: s.defaultSalePrice, ...s }} onPick={onPick} />
      ))}
      {items.length === 0 && services.length === 0 && (
        <p className="col-span-full py-8 text-center text-[13px] text-ink-500">Nothing here yet.</p>
      )}
    </div>
  );
}

function OfferingCard({ offering, onPick }: { offering: Offering; onPick: (o: Offering) => void }) {
  const outOfStock = offering.inventory.isApplicable && (offering.inventory.availableQty ?? 0) <= 0;
  const lowStock =
    !outOfStock &&
    offering.inventory.isApplicable &&
    (offering.inventory.availableQty ?? 0) <= (offering.inventory.threshold ?? 0) + 1;

  return (
    <button
      onClick={() => onPick(offering)}
      disabled={outOfStock}
      className="flex flex-col items-start gap-2 rounded-2xl border border-gold-500/15 bg-white p-4 text-left transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-16 w-full items-center justify-center rounded-xl bg-ivory-100">
        {offering.refType === "Service" ? <SparkleIcon /> : <BoxGlyph />}
      </span>
      <div>
        <p className="text-[13px] font-medium text-ink-100">{offering.name}</p>
        {offering.tamilName && <p className="text-[11.5px] text-ink-500">{offering.tamilName}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10.5px] ${
            offering.refType === "Service"
              ? "border-gold-500/25 bg-gold-500/10 text-amber-700"
              : "border-ink-500/20 bg-ivory-100 text-ink-500"
          }`}
        >
          {offering.refType}
        </span>
        {outOfStock && (
          <span className="rounded-full border border-crimson-500/30 bg-crimson-500/10 px-2 py-0.5 text-[10.5px] text-crimson-500">
            Out of Stock
          </span>
        )}
        {!outOfStock && lowStock && (
          <span className="rounded-full border border-flame-500/30 bg-flame-500/10 px-2 py-0.5 text-[10.5px] text-flame-500">
            Low Stock
          </span>
        )}
      </div>
      <p className="font-semibold text-amber-600">{formatCurrency(offering.salePrice)}</p>
    </button>
  );
}

function CartLineRow({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  return (
    <div className={`rounded-xl border p-3 ${line.quantityExceedsStock ? "border-crimson-500/30 bg-crimson-500/5" : "border-gold-500/15 bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink-100">{line.name}</p>
          <p className="text-[11.5px] text-ink-500">
            {line.refType} · Qty {line.quantity}
            {line.devotees.length > 0 && ` · ${line.devotees.map((d) => d.name).join(", ")}`}
          </p>
          {line.quantityExceedsStock && (
            <p className="text-[11px] text-crimson-500">Only {line.inventory?.availableQty ?? 0} available</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-[13px] font-semibold text-amber-600">
            {formatCurrency(line.lineTotal ?? line.unitPrice * line.quantity)}
          </span>
          <button onClick={onRemove} aria-label={`Remove ${line.name}`} className="text-ink-500 hover:text-crimson-500">
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddToCartModal({
  offering,
  deityOptions,
  nakshatraOptions,
  deities,
  onDeitiesChange,
  devotees,
  onDevoteesChange,
  devoteeRows,
  onAddDevotee,
  onRemoveDevotee,
  quantity,
  onQuantityChange,
  total,
  onCancel,
  onConfirm,
}: {
  offering: Offering;
  deityOptions: DeityOption[];
  nakshatraOptions: ListboxOption[];
  deities: string[];
  onDeitiesChange: (v: string[]) => void;
  devotees: Devotee[];
  onDevoteesChange: (v: Devotee[]) => void;
  devoteeRows: number;
  onAddDevotee: () => void;
  onRemoveDevotee: (idx: number) => void;
  quantity: number;
  onQuantityChange: (v: number) => void;
  total: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  function toggleDeity(id: string) {
    onDeitiesChange(deities.includes(id) ? deities.filter((d) => d !== id) : [...deities, id]);
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="pointer-events-auto flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gold-500/20 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-start justify-between border-b border-gold-500/10 px-6 py-5">
            <div>
              <h2 className="font-display text-[19px] font-bold text-ink-100">{offering.name}</h2>
              {offering.tamilName && <p className="text-[13px] text-ink-500">{offering.tamilName}</p>}
            </div>
            <button onClick={onCancel} aria-label="Close" className="rounded-lg p-1.5 text-ink-500 hover:bg-ivory-100">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {offering.isDeityMappingRequired && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">Deities (Multi-Select) *</p>
                <div className="flex flex-wrap gap-2">
                  {deityOptions.map((d) => (
                    <button
                      key={d._id}
                      type="button"
                      onClick={() => toggleDeity(d._id)}
                      className={`rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
                        deities.includes(d._id)
                          ? "border-crimson-500 bg-crimson-500/5 text-crimson-500"
                          : "border-gold-500/25 text-ink-200 hover:border-gold-400/60"
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] text-ink-500">
                  {deities.length} deity/deities selected · Qty: {deities.length || 0}
                </p>
              </div>
            )}

            {!offering.isDeityMappingRequired && (
              <div className="w-32">
                <DivineInput
                  label="Quantity"
                  type="number"
                  min={1}
                  value={String(quantity)}
                  onChange={(e) => onQuantityChange(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            )}

            {offering.isFamilyMembersRequired && devoteeRows > 0 && (
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-wide text-amber-600">
                  Devotee Details (max {offering.maxFamilyMembers}) *
                </p>
                {devotees.map((devotee, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_140px_auto] items-start gap-2">
                    <DivineInput
                      label={`${idx + 1}.`}
                      value={devotee.name}
                      onChange={(e) => {
                        const updated = [...devotees];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        onDevoteesChange(updated);
                      }}
                    />
                    <DivineListbox
                      value={devotee.nakshatra}
                      onChange={(v) => {
                        const updated = [...devotees];
                        updated[idx] = { ...updated[idx], nakshatra: v };
                        onDevoteesChange(updated);
                      }}
                      options={nakshatraOptions}
                      placeholder="Nakshatra"
                    />
                    {devotees.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveDevotee(idx)}
                        aria-label="Remove family member"
                        className="mt-2 text-ink-500 hover:text-crimson-500"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                ))}
                {devotees.length < offering.maxFamilyMembers && (
                  <button
                    type="button"
                    onClick={onAddDevotee}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-700 hover:underline"
                  >
                    <PlusIcon /> Add family member
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gold-500/10 px-6 py-4">
            <p className="text-[14px]">
              <span className="text-ink-500">Total: </span>
              <span className="font-bold text-amber-600">{formatCurrency(total)}</span>
            </p>
            <div className="flex gap-3">
              <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onCancel}>
                Cancel
              </DivineButton>
              <DivineButton fullWidth={false} type="button" onClick={onConfirm}>
                Add to Cart
              </DivineButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

const CREATE_CUSTOMER_GENDER_OPTIONS: ListboxOption[] = [
  { value: "", label: "Not specified" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

type WalkInMatch = {
  _id: string;
  customerCode: string;
  name: string;
  email: string;
  mobileNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
};

/**
 * Captures the same fields the Admin Panel's Customer master can edit
 * (name, email, mobile, date of birth, gender) — a walk-in profile created
 * at the counter shouldn't be a lesser record than one created any other
 * way, and staff can later find/edit this exact profile from Customers.
 *
 * As the mobile number is typed, it's checked (debounced) against existing
 * *unregistered* walk-in profiles — a repeat visitor on the same mobile
 * auto-fills from their earlier profile instead of hitting the
 * mobile-uniqueness error on a second create, and the button just selects
 * that existing profile rather than posting a duplicate. A profile that's
 * already fully registered is never matched this way (see the backend's
 * isRegistered field) — reusing one of those goes through customer search.
 */
function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Customer) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<WalkInMatch | null>(null);
  const [checkingMobile, setCheckingMobile] = useState(false);

  useEffect(() => {
    const mobile = mobileNumber.trim();
    if (mobile.length < 6) {
      setMatched(null);
      return;
    }
    const t = setTimeout(async () => {
      setCheckingMobile(true);
      try {
        const r = await api.get<ApiEnvelope<WalkInMatch | null>>("/pos/booking/customers/lookup", { params: { mobileNumber: mobile } });
        const found = unwrap(r);
        setMatched(found);
        if (found) {
          setName(found.name);
          setEmail(found.email);
          setDateOfBirth(found.dateOfBirth ? found.dateOfBirth.slice(0, 10) : "");
          setGender(found.gender ?? "");
        }
      } catch {
        // A failed lookup shouldn't block manual entry — just proceed uncached.
      } finally {
        setCheckingMobile(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [mobileNumber]);

  function clearMatch() {
    setMatched(null);
    setName("");
    setEmail("");
    setDateOfBirth("");
    setGender("");
  }

  async function submit() {
    if (matched) {
      onCreated(matched);
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.post<ApiEnvelope<Customer>>("/pos/booking/customers", {
        name: name.trim(),
        email: email.trim(),
        mobileNumber: mobileNumber.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      const customer = unwrap(r);
      toast.created("Devotee profile created.");
      onCreated(customer);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-gold-500/20 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="border-b border-gold-500/10 px-6 py-5">
            <h2 className="font-display text-[18px] font-bold text-ink-100">Create Customer</h2>
            <p className="text-[12.5px] text-ink-500">Quick walk-in profile — no login required.</p>
          </div>
          <div className="px-6 py-5">
            {matched && (
              <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-gold-500/25 bg-gold-500/5 px-3.5 py-2.5">
                <p className="text-[12.5px] text-amber-700">
                  Existing profile found for this mobile number ({matched.customerCode}) — details filled in below.
                </p>
                <button type="button" onClick={clearMatch} className="whitespace-nowrap text-[12px] text-crimson-500 hover:underline">
                  Not this person?
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DivineInput label="Full Name" icon={<UserIcon />} value={name} onChange={(e) => setName(e.target.value)} disabled={!!matched} />
              <DivineInput label="Email" icon={<MailIcon />} value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!matched} />
              <DivineInput
                label="Mobile Number"
                icon={<PhoneIcon />}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                hint={checkingMobile ? "Checking…" : undefined}
              />
              <DivineDatePicker label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} placeholder="Not recorded" />
              <DivineListbox label="Gender" value={gender} onChange={setGender} options={CREATE_CUSTOMER_GENDER_OPTIONS} disabled={!!matched} />
            </div>
            {error && <p className="mt-3 text-[12.5px] text-crimson-500">{error}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t border-gold-500/10 px-6 py-4">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onClose}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="button" loading={submitting} onClick={submit}>
              {matched ? "Use This Customer" : "Create"}
            </DivineButton>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Shows a past booking's line items in a center-screen popup — "repeat this
 * booking" for the counter. Add to Cart re-checks live availability before
 * doing anything (see addRecentBookingToCart); this component only renders
 * what was originally bought and triggers that check.
 */
function RecentBookingModal({
  booking,
  loading,
  onClose,
  onAddToCart,
}: {
  booking: RecentBooking;
  loading: boolean;
  onClose: () => void;
  onAddToCart: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="pointer-events-auto flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gold-500/20 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-start justify-between border-b border-gold-500/10 px-6 py-5">
            <div>
              <h2 className="font-display text-[19px] font-bold text-ink-100">{booking.orderNumber ?? booking.bookingNumber}</h2>
              <p className="text-[13px] text-ink-500">{formatTempleDateTime(booking.bookedAt)}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-500 hover:bg-ivory-100">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
            {booking.lines.map((line, idx) => (
              <div key={idx} className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-medium text-ink-100">{line.name}</p>
                    <p className="text-[11.5px] text-ink-500">
                      {line.refType} · {line.code} · Qty {line.quantity}
                    </p>
                    {line.deities.length > 0 && (
                      <p className="mt-1 text-[11.5px] text-ink-500">Deities: {line.deities.map((d) => d.name).join(", ")}</p>
                    )}
                    {line.devotees.length > 0 && (
                      <p className="text-[11.5px] text-ink-500">Devotees: {line.devotees.map((d) => d.name).join(", ")}</p>
                    )}
                  </div>
                  <span className="whitespace-nowrap font-semibold text-amber-600">{formatCurrency(line.lineTotal)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-gold-500/10 px-6 py-4">
            <p className="text-[14px]">
              <span className="text-ink-500">Total: </span>
              <span className="font-bold text-amber-600">{formatCurrency(booking.grandTotal)}</span>
            </p>
            <div className="flex gap-3">
              <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onClose} disabled={loading}>
                Cancel
              </DivineButton>
              <DivineButton fullWidth={false} type="button" loading={loading} onClick={onAddToCart}>
                Add to Cart
              </DivineButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Shown when re-adding a past booking finds some lines no longer valid
 * (deactivated, out of stock, ...) — lists exactly what's unavailable and
 * why, and lets staff proceed with just the still-available lines instead
 * of failing the whole re-order.
 */
function UnavailableLinesDialog({
  unavailableLines,
  availableCount,
  onCancel,
  onProceed,
}: {
  unavailableLines: RecheckedLine[];
  availableCount: number;
  onCancel: () => void;
  onProceed: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-gold-500/20 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="border-b border-gold-500/10 px-6 py-5">
            <h2 className="font-display text-[18px] font-bold text-ink-100">Some items aren&apos;t available</h2>
            <p className="text-[12.5px] text-ink-500">
              {availableCount > 0
                ? `${availableCount} item(s) from this booking are still available. The rest can't be re-added right now:`
                : "None of this booking's items can be re-added right now:"}
            </p>
          </div>
          <div className="max-h-[40vh] space-y-2 overflow-y-auto px-6 py-5">
            {unavailableLines.map((line, idx) => (
              <div key={idx} className="rounded-xl border border-crimson-500/25 bg-crimson-500/5 px-3 py-2.5">
                <p className="text-[13px] font-medium text-ink-100">{line.name ?? "Unknown item"}</p>
                <p className="text-[11.5px] text-crimson-500">{line.reason}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 border-t border-gold-500/10 px-6 py-4">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onCancel}>
              Cancel
            </DivineButton>
            {availableCount > 0 && (
              <DivineButton fullWidth={false} type="button" onClick={onProceed}>
                Add {availableCount} Available Item{availableCount > 1 ? "s" : ""}
              </DivineButton>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Payment popup shown once "Proceed to Payment" is clicked — Cash is the
 * only mode surfaced today (other gateways aren't wired up yet), confirmed
 * immediately on submit rather than left in the 30-minute hold window.
 */
function PaymentModal({
  paymentModes,
  selectedPaymentModeId,
  onSelectPaymentMode,
  subtotal,
  gstAmount,
  grandTotal,
  loading,
  onConfirm,
  onCancel,
}: {
  paymentModes: PaymentMode[];
  selectedPaymentModeId: string;
  onSelectPaymentMode: (id: string) => void;
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cashModes = paymentModes.filter((m) => m.name.toLowerCase() === "cash");

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-gold-500/20 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="border-b border-gold-500/10 px-6 py-5">
            <h2 className="font-display text-[18px] font-bold text-ink-100">Payment Mode</h2>
            <p className="text-[12.5px] text-ink-500">Choose how the devotee is paying.</p>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              {cashModes.map((m) => (
                <label key={m._id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gold-500/20 bg-ivory-100 px-3 py-2.5">
                  <input
                    type="radio"
                    checked={selectedPaymentModeId === m._id}
                    onChange={() => onSelectPaymentMode(m._id)}
                    className="accent-amber-600"
                  />
                  <span className="text-[13px] font-medium text-ink-100">{m.name}</span>
                </label>
              ))}
              {cashModes.length === 0 && (
                <p className="text-[12.5px] text-crimson-500">No active Cash payment mode is configured.</p>
              )}
              <p className="text-[11px] text-ink-500">Cash is confirmed immediately upon booking. Other payment modes will be added later.</p>
            </div>

            <div className="space-y-1.5 rounded-xl border border-gold-500/15 bg-ivory-50 px-3 py-3 text-[13px]">
              <div className="flex justify-between text-ink-500">
                <span>Sub Total (S$)</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-ink-500">
                <span>GST (S$)</span>
                <span>{formatCurrency(gstAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-gold-500/10 pt-1.5 font-bold text-ink-100">
                <span>Total Payable (S$)</span>
                <span className="text-amber-600">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gold-500/10 px-6 py-4">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onCancel} disabled={loading}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="button" loading={loading} disabled={loading || !selectedPaymentModeId} onClick={onConfirm}>
              Confirm Booking
            </DivineButton>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function BookingSuccessView({ confirmation, onNewTransaction }: { confirmation: BookingConfirmation; onNewTransaction: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-lg rounded-2xl border border-gold-500/20 bg-white p-8 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.2)]"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10">
          <svg className="h-8 w-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="font-display text-[24px] font-bold text-ink-100">Booking Confirmed!</h2>
        <p className="mt-1 text-[13px] text-ink-500">Payment received · Inventory updated</p>
        <div className="my-6 space-y-2 rounded-xl border border-gold-500/15 bg-ivory-100 px-5 py-4 text-left text-[13px]">
          <Row label="Booking No." value={confirmation.bookingNumber} highlight />
          <Row label="Order No." value={confirmation.orderNumber} />
          <Row label="Receipt No." value={confirmation.receiptNo} />
          <Row label="Customer" value={`${confirmation.customer.name} (${confirmation.customer.customerCode})`} />
          <Row label="Payment" value={`${confirmation.paymentModeName} — ${confirmation.paymentStatus}`} />
          <div className="border-t border-gold-500/10 pt-2">
            <Row label="Grand Total" value={formatCurrency(confirmation.grandTotal)} highlight />
          </div>
        </div>
        <DivineButton fullWidth onClick={onNewTransaction}>
          <PlusIcon /> New Transaction
        </DivineButton>
      </motion.div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className={highlight ? "font-bold text-amber-600" : "font-medium text-ink-100"}>{value}</span>
    </div>
  );
}
