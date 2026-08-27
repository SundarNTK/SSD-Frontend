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
  PencilIcon,
  CartIcon,
  UserIcon,
  PhoneIcon,
  MailIcon,
  PlusIcon,
  LogoutIcon,
  ChevronIcon,
  HistoryIcon,
  PrinterIcon,
  LockIcon,
  HomeIcon,
} from "../divine/icons";

// Shared by every text/select/date field on the counter screen — search
// bars, and every field inside a popup form — a themed border/shadow at
// rest, with its own distinct hover state, on top of each field's existing
// gold focus glow. A ring rather than a border override: stacking another
// border-* utility on top of these components' own conditional border-*
// classes would leave the winner up to Tailwind's generation order rather
// than source order (same CSS property, same specificity).
const FIELD_ACCENT =
  "ring-1 ring-orange-200/70 shadow-[0_4px_16px_-8px_rgba(255,122,46,0.35)] hover:ring-orange-400/80 hover:shadow-[0_6px_22px_-6px_rgba(255,122,46,0.5)]";

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
  subCategoryTamilName?: string | null;
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
  /** Present only on the catalogue's uncategorized list — the category a
   *  subCategory-less mapping still belongs to, or null when there's no
   *  category at all. Lets a category-only item show up both in the
   *  unfiltered "All Categories" view and inside that one category's
   *  filtered view, without a folder to sit in. */
  categoryId?: string | null;
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
  /** Same as PosItem.categoryId — see above. */
  categoryId?: string | null;
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
  // The full offering this line was added from — kept so re-opening the
  // Edit modal later doesn't depend on the offering still being in whatever
  // catalogue list/search results happen to be loaded at that moment.
  // Populated for "repeat a past booking" lines too (recheck-lines returns
  // the same metadata alongside every available line). Stays optional
  // purely as a defensive fallback — if a line somehow arrives without it,
  // it just doesn't get an Edit button (see CartLineRow) instead of crashing.
  offering?: Offering;
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
  // Only present when available — lets the "repeat a past booking" flow
  // reconstruct a full Offering so its cart lines get an Edit button too.
  tamilName?: string;
  isDeityMappingRequired?: boolean;
  deityMapping?: DeityOption[];
  isFamilyMembersRequired?: boolean;
  maxFamilyMembers?: number;
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
  const [customerRequiredNotice, setCustomerRequiredNotice] = useState(false);

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
  // Truly-uncategorized entries (categoryId: null) only make sense in the
  // unfiltered view; a category-only entry (categoryId set, no
  // subCategory) belongs in that category's filtered view too, the same
  // way a folder does.
  const visibleUncategorizedItems = selectedCategoryId
    ? uncategorizedItems.filter((i) => i.categoryId === selectedCategoryId)
    : uncategorizedItems;
  const visibleUncategorizedServices = selectedCategoryId
    ? uncategorizedServices.filter((s) => s.categoryId === selectedCategoryId)
    : uncategorizedServices;

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

  // ── nakshatra master ────────────────────────────────────────────────────
  // No general deity-roster fetch here any more — each offering's own
  // deityMapping is the only source of deity choices now (see
  // modalDeityChoices), so there's nothing left to use a full active
  // roster for.
  const [nakshatraOptions, setNakshatraOptions] = useState<ListboxOption[]>([]);

  useEffect(() => {
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
    const newLines: CartLine[] = lines.map((l) => {
      // recheck-lines returns offering metadata alongside every available
      // line specifically so this reconstruction is possible — without it,
      // a "repeat a past booking" line couldn't get an Edit button at all
      // (isDeityMappingRequired/maxFamilyMembers aren't derivable from just
      // name/code/price).
      const offering: Offering | undefined =
        l.isDeityMappingRequired !== undefined
          ? ({
              refType: l.refType,
              _id: l.refId,
              code: l.code ?? "",
              name: l.name ?? "",
              tamilName: l.tamilName ?? "",
              salePrice: l.unitPrice ?? 0,
              isDeityMappingRequired: l.isDeityMappingRequired,
              deityMapping: l.deityMapping ?? [],
              isFamilyMembersRequired: l.isFamilyMembersRequired ?? false,
              maxFamilyMembers: l.maxFamilyMembers ?? 1,
              inventory: { isApplicable: false },
            } as Offering)
          : undefined;

      return {
        id: newLineId(),
        refType: l.refType,
        refId: l.refId,
        name: l.name ?? "",
        code: l.code ?? "",
        quantity: l.quantity,
        unitPrice: l.unitPrice ?? 0,
        deities: l.deities,
        devotees: l.devotees,
        offering,
      };
    });
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
  // Set while editing an existing cart line instead of adding a new one —
  // confirmAddToCart() branches on this to update in place rather than append.
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  function openAddModal(offering: Offering) {
    if (!selectedCustomer) {
      setCustomerRequiredNotice(true);
      return;
    }
    setEditingLineId(null);
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

  // Reopens the same modal pre-filled with what's already on this cart
  // line, so the deity/devotee selections already made for it aren't lost
  // just to change one of them.
  function openEditModal(line: CartLine) {
    const offering = line.offering;
    if (!offering) return;
    setEditingLineId(line.id);
    setModalOffering(offering);
    setModalDeities(line.deities);
    const startRows = offering.isFamilyMembersRequired ? Math.max(1, offering.maxFamilyMembers || 1) : 1;
    const rows = Array.from({ length: Math.max(startRows, line.devotees.length) }, (_, i) => line.devotees[i] ?? { name: "", nakshatra: "" });
    setModalDevotees(rows);
    setModalQuantity(line.quantity);
  }

  const modalDevoteeRows = modalOffering?.isFamilyMembersRequired ? modalDevotees.length : 0;
  // Deity-mapped offerings must have their own curated deityMapping — an
  // empty list means the master was never configured with deities, not
  // "any deity goes", so this deliberately does NOT fall back to the full
  // active roster (deityOptions) any more. The modal shows a blocking note
  // instead of a deity picker when this is empty (see AddToCartModal).
  const modalDeityChoices = modalOffering?.deityMapping ?? [];

  // Devotee names the selected customer has already used, across their last
  // 3 confirmed bookings (recentBookings is already limited to that) — so
  // typing a devotee name here can suggest "who usually gets booked for",
  // deduplicated since the same devotee often appears across bookings.
  const devoteeNameSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const booking of recentBookings) {
      for (const line of booking.lines) {
        for (const devotee of line.devotees) {
          const trimmed = devotee.name.trim();
          if (trimmed) names.add(trimmed);
        }
      }
    }
    return Array.from(names);
  }, [recentBookings]);

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

    if (editingLineId) {
      const lineId = editingLineId;
      setCart((prev) =>
        prev.map((l) =>
          l.id === lineId
            ? {
                ...l,
                quantity: modalEffectiveQty || 1,
                deities: modalDeities,
                devotees: modalOffering.isFamilyMembersRequired ? filledDevotees : [],
                offering: modalOffering,
              }
            : l
        )
      );
      setModalOffering(null);
      setEditingLineId(null);
      toast.updated(`${modalOffering.name} updated.`);
      return;
    }

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
      offering: modalOffering,
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
  const [step, setStep] = useState<"cart" | "done">("cart");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const hasStockIssues = cart.some((l) => l.quantityExceedsStock);
  const canProceed = selectedCustomer && cart.length > 0 && !hasStockIssues && !summaryLoading;
  const cashMode = paymentModes.find((m) => m.name.toLowerCase() === "cash");
  const selectedModeName = paymentModes.find((m) => m._id === selectedPaymentModeId)?.name ?? "Cash";
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
      <div className="relative z-10 grid grid-cols-1 gap-4 p-4 lg:h-full lg:grid-cols-[260px_1fr_360px]">
        {/* ── LEFT: customer panel ─────────────────────────────────────── */}
        <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_8px_28px_-14px_rgba(179,39,63,0.25)] backdrop-blur-md lg:h-full lg:overflow-y-auto">
          {!selectedCustomer && <PanelGlow />}
          <p className="font-accent text-[16px] font-extrabold tracking-tight text-ink-100">Customer</p>
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
              containerClassName={FIELD_ACCENT}
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
            <FlameActionButton icon={<UserIcon />} chevron={false} onClick={() => setCreateCustomerOpen(true)} className="w-full justify-center">
              Create Customer
            </FlameActionButton>
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
                  className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-orange-200/60 bg-white/60 px-3 py-2.5 text-left shadow-[0_2px_10px_-6px_rgba(255,122,46,0.3)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_10px_22px_-12px_rgba(255,122,46,0.45)]"
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
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_8px_28px_-14px_rgba(179,39,63,0.25)] backdrop-blur-md lg:h-full">
          <div className="space-y-3 p-4 pb-2">
            <DivineInput
              label="Search offerings…"
              icon={<SearchIcon />}
              value={offeringSearch}
              onChange={(e) => setOfferingSearch(e.target.value)}
              containerClassName={FIELD_ACCENT}
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSelectedCategoryId("");
                  setActiveFolder(null);
                }}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-[transform,box-shadow,background-color,color] duration-200 hover:-translate-y-0.5 ${
                  !selectedCategoryId
                    ? "border-transparent bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FFC145] text-white shadow-[0_8px_18px_-8px_rgba(255,122,46,0.55)]"
                    : "border-orange-200/70 bg-white/60 text-ink-300 shadow-[0_2px_10px_-6px_rgba(255,122,46,0.35)] hover:border-flame-500/70 hover:bg-white/80 hover:text-flame-600 hover:shadow-[0_8px_18px_-10px_rgba(255,122,46,0.5)]"
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
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-[transform,box-shadow,background-color,color] duration-200 hover:-translate-y-0.5 ${
                    selectedCategoryId === c._id
                      ? "border-transparent bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FFC145] text-white shadow-[0_8px_18px_-8px_rgba(255,122,46,0.55)]"
                      : "border-orange-200/70 bg-white/60 text-ink-300 shadow-[0_2px_10px_-6px_rgba(255,122,46,0.35)] hover:border-flame-500/70 hover:bg-white/80 hover:text-flame-600 hover:shadow-[0_8px_18px_-10px_rgba(255,122,46,0.5)]"
                  }`}
                >
                  {c.name} ({c.count})
                </button>
              ))}
            </div>
          </div>

          <div className="px-4">
            <SectionScreenDivider />
          </div>

          <div className="p-4 pt-2 lg:flex-1 lg:overflow-y-auto">
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
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <button
                      onClick={() => {
                        setActiveFolder(null);
                        setSelectedCategoryId("");
                      }}
                      className="flex items-center gap-1 text-ink-500 transition-colors hover:text-flame-600"
                    >
                      <HomeIcon /> All Categories
                    </button>
                    <ChevronIcon className="-rotate-90 text-ink-400" />
                    <button
                      onClick={() => {
                        setActiveFolder(null);
                        setSelectedCategoryId(activeFolder.categoryId);
                      }}
                      className="text-ink-500 transition-colors hover:text-amber-600"
                    >
                      {activeFolder.categoryName}
                    </button>
                    <ChevronIcon className="-rotate-90 text-ink-400" />
                    <span className="flex items-center gap-1.5 font-accent text-[16px] font-extrabold tracking-tight text-ink-100">
                      <FolderIcon /> {activeFolder.subCategoryName}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveFolder(null)}
                    className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-crimson-500 hover:underline"
                  >
                    <ChevronIcon className="rotate-90" /> Back
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
                  <CatalogueCard
                    key={`${f.categoryId}::${f.subCategoryId}`}
                    onClick={() => openFolder(f)}
                    iconKind="folder"
                    title={f.subCategoryName}
                    tamilName={f.subCategoryTamilName ?? undefined}
                    theme={CATALOGUE_CARD_THEME.folder}
                    rowIcon={<ListRowIcon className={CATALOGUE_CARD_THEME.folder.rowText} />}
                    rowLabel={`${f.total} offering(s)`}
                  />
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
        <div className="flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_8px_28px_-14px_rgba(179,39,63,0.25)] backdrop-blur-md lg:h-full">
          <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FFC145] px-4 py-3">
            <p className="flex items-center gap-2 font-accent text-[16px] font-extrabold tracking-tight text-white">
              <CartIcon /> Cart <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-semibold text-white">{cart.length}</span>
            </p>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                aria-label="Clear cart"
                className="flex items-center gap-1.5 rounded-full border border-white bg-white px-3 py-1.5 text-[11.5px] font-semibold text-crimson-600 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-crimson-500/10"
              >
                <TrashIcon /> Clear Cart
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="lg:flex-1 lg:overflow-y-auto">
              {cart.length === 0 ? (
                <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden py-10 text-center">
                  <PanelGlow />
                  <span className="relative z-0 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_8px_18px_-6px_rgba(255,122,46,0.4)]">
                    <CartIcon />
                  </span>
                  <p className="text-[13px] font-medium text-ink-300">No items or services added</p>
                  <p className="text-[11.5px] text-ink-500">Select an offering to begin the transaction.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {cart.map((line) => (
                      <motion.div
                        key={line.id}
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <CartLineRow line={line} onEdit={() => openEditModal(line)} onRemove={() => removeCartLine(line.id)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="mt-3 space-y-2 border-t-2 border-orange-200/80 pt-3 text-[13px]">
              <div className="flex justify-between text-ink-500">
                <span>Sub Total (S$)</span>
                <span>{formatCurrency(summary?.subtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between border-t border-gold-500/10 pt-2 font-bold text-ink-100">
                <span>Total Payable (S$)</span>
                <span className="bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FF8C1A] bg-clip-text text-transparent">
                  {formatCurrency(summary?.grandTotal ?? 0)}
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-600">
                <CashIcon className="h-3.5 w-3.5" /> Payment Method
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => cashMode && setSelectedPaymentModeId(cashMode._id)}
                  disabled={!cashMode}
                  className={`group relative flex flex-col items-center gap-1 overflow-hidden rounded-lg border-2 px-2 py-1.5 text-center transition-[border-color,box-shadow,transform,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedPaymentModeId && selectedPaymentModeId === cashMode?._id
                      ? "border-transparent bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-400 shadow-[0_8px_18px_-8px_rgba(16,185,129,0.6)]"
                      : "border-gold-500/20 hover:-translate-y-0.5 hover:border-flame-400/50 hover:shadow-[0_4px_12px_-6px_rgba(255,122,46,0.35)]"
                  }`}
                >
                  <AnimatePresence initial={false}>
                    {selectedPaymentModeId && selectedPaymentModeId === cashMode?._id && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/25"
                      >
                        <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <CashIcon
                    className={`h-4 w-4 transition-colors duration-200 ${
                      selectedPaymentModeId && selectedPaymentModeId === cashMode?._id ? "text-white" : "text-emerald-600"
                    }`}
                  />
                  <span
                    className={`text-[11.5px] font-semibold transition-colors duration-200 ${
                      selectedPaymentModeId && selectedPaymentModeId === cashMode?._id ? "text-white" : "text-ink-100"
                    }`}
                  >
                    Cash
                  </span>
                </button>

                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="PayNow isn't available yet"
                  className="flex cursor-not-allowed flex-col items-center gap-1 rounded-lg border-2 border-gold-500/15 bg-ivory-50/60 px-2 py-1.5 text-center opacity-50"
                >
                  <span className="text-[12.5px] font-black italic tracking-tight text-ink-300">PayNow</span>
                  <span className="text-[9px] font-medium text-ink-500">Coming soon</span>
                </button>
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
              <p className="mt-2 rounded-lg bg-crimson-500/10 py-2 text-center text-[11.5px] font-medium text-crimson-500">
                {!selectedCustomer
                  ? "Select a customer above to proceed."
                  : cart.length === 0
                    ? "Add an item or service to the cart to proceed."
                    : "Calculating totals…"}
              </p>
            )}

            <div className="mt-3 space-y-2">
              <FlameActionButton
                icon={<LockIcon />}
                chevron={false}
                onClick={handleConfirmBooking}
                disabled={!canProceed || !selectedPaymentModeId || bookingLoading}
                className="w-full justify-center"
              >
                {bookingLoading ? "Confirming…" : `Confirm ${selectedModeName} Payment`}
              </FlameActionButton>
            </div>
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
          devoteeNameSuggestions={devoteeNameSuggestions}
          quantity={modalQuantity}
          onQuantityChange={setModalQuantity}
          total={modalTotal}
          isEditing={!!editingLineId}
          onCancel={() => {
            setModalOffering(null);
            setEditingLineId(null);
          }}
          onConfirm={confirmAddToCart}
        />
      )}

      {customerRequiredNotice && <CustomerRequiredNotice onClose={() => setCustomerRequiredNotice(false)} />}
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
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="pos-flame-canvas relative flex h-screen w-full flex-col overflow-hidden">
      <AnimatePresence>{signingOut && <SignOutOverlay />}</AnimatePresence>
      <div aria-hidden="true" className="h-1.5 shrink-0 bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FFC145]" />
      <header className="relative z-20 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/70 bg-white/92 px-3 py-2.5 shadow-[0_8px_28px_-8px_rgba(179,39,63,0.22)] backdrop-blur-md sm:px-6 sm:py-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center">
          <img
            src="/SSD_Full_Logo.png"
            alt="Sri Siva Durga Temple"
            className="h-14 w-auto max-w-[240px] shrink-0 object-contain sm:h-16 sm:max-w-[280px] lg:h-[68px] lg:max-w-[320px]"
          />
        </div>

        {/* Grouped and centered as one cluster — grid-cols-[1fr_auto_1fr] on
            the header keeps this column mathematically centered regardless
            of how wide the logo or the clock/avatar column end up being. */}
        <div className="col-start-2 hidden items-center justify-center gap-2 md:flex">
          <FlameActionButton icon={<HistoryIcon />} chevron={false} onClick={() => toast.error("Transaction History isn't built yet.")}>
            Transaction History
          </FlameActionButton>
          <FlameActionButton icon={<PrinterIcon />} chevron={false} onClick={() => toast.error("Reprint isn't built yet.")}>
            Reprint
          </FlameActionButton>
          <FlameActionButton icon={<PlusIcon />} onClick={onNewTransaction}>
            New Transaction
          </FlameActionButton>
        </div>

        <div className="col-start-3 flex min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <TempleClock variant="flame" />
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/60">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-crimson-600 via-flame-500 to-[#FFC145] text-[12px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(255,122,46,0.6)]">
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
                    onClick={() => {
                      setSigningOut(true);
                      endSession("signed-out");
                    }}
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

/**
 * Covers the whole screen the instant Sign out is clicked. `endSession()`
 * clears the store synchronously and only then triggers the redirect — a
 * paint can slip in between those two steps and briefly show "Unknown"
 * where the user's name was. This overlay sits above that gap so nothing
 * shows through, and stays up until the browser navigates away.
 */
function SignOutOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pos-flame-canvas fixed inset-0 z-50 flex flex-col items-center justify-center gap-5"
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-soft-pulse rounded-full bg-[#FFC145]/40 blur-2xl" />
        <span className="absolute inset-0 rounded-full border-4 border-white/40" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#FFC145] border-r-flame-500" style={{ animationDuration: "0.9s" }} />
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-flame-600 shadow-[0_8px_20px_-6px_rgba(255,122,46,0.5)]">
          <LogoutIcon />
        </span>
      </div>
      <div className="text-center">
        <p className="font-accent text-[15px] font-extrabold tracking-tight text-ink-100">Signing you out…</p>
        <p className="mt-1 text-[12.5px] text-ink-500">Taking you back to the login screen.</p>
      </div>
    </motion.div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

/**
 * The pill-shaped action button used across the counter screen's topbar,
 * Customer panel, and Cart footer — an icon badge, a divider, a bold label,
 * and a chevron, on the red -> orange -> yellow gradient (or a plain red
 * one for the one destructive action, Clear Cart). Idle and hover carry
 * two visibly different border treatments — a dim red ring at rest, a
 * glowing gold ring on hover — plus the gradient itself brightens, a shine
 * sweeps across, and a few sparks fade in at the corners.
 */
function FlameActionButton({
  icon,
  children,
  onClick,
  disabled,
  chevron = true,
  tone = "flame",
  className = "",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  chevron?: boolean;
  tone?: "flame" | "crimson";
  className?: string;
}) {
  // Four-stop gold/orange/red/yellow gradient — Tailwind's from/via/to
  // gradient utilities only carry one "via" stop, so a real 4-color blend
  // needs an arbitrary background-image rather than the gradient-* classes.
  const gradientBg =
    tone === "crimson"
      ? "bg-gradient-to-r from-red-700 via-crimson-600 to-crimson-500"
      : "bg-[linear-gradient(to_right,#DC2626,#F97316,#F5A623,#FACC15)]";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-full border-2 border-red-900/30 ${gradientBg} bg-[length:200%_200%] bg-left px-3.5 py-1.5 text-white shadow-[0_10px_24px_-10px_rgba(255,90,30,0.55)] transition-[transform,box-shadow,background-position,border-color] duration-300 hover:-translate-y-0.5 hover:border-[#FFD700] hover:bg-right hover:shadow-[0_0_0_3px_rgba(255,215,0,0.3),0_18px_36px_-10px_rgba(255,90,30,0.7)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-red-900/30 disabled:hover:bg-left disabled:hover:shadow-[0_10px_24px_-10px_rgba(255,90,30,0.55)] ${className}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/35 to-transparent" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-[140%] bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 group-hover:translate-x-[140%]"
      />
      <Spark className="absolute -left-2 -top-2 h-3 w-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100" delay={0} duration={1.8} />
      <Spark className="absolute -right-2 -top-1 h-3.5 w-3.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" delay={0.3} duration={2.1} />
      <Spark className="absolute -bottom-2 right-6 h-2.5 w-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" delay={0.6} duration={1.6} />

      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/18 ring-2 ring-white/0 transition-[box-shadow] duration-300 group-hover:ring-[#FFD700]/70">
        {icon}
      </span>
      <span aria-hidden="true" className="h-4 w-px bg-white/35" />
      <span className="relative z-10 whitespace-nowrap text-[13px] font-bold">{children}</span>
      {chevron && <ChevronIcon className="relative z-10 ml-auto -rotate-90 text-white/90" />}
    </button>
  );
}

/**
 * Three softly blurred, slowly drifting color blobs — decorative only
 * (aria-hidden, pointer-events-none), sitting on a negative z-index so they
 * paint behind the panel's real content instead of on top of it. Needs the
 * parent to be `relative overflow-hidden` so the blobs stay clipped to the
 * panel's rounded corners instead of drifting past them.
 */
function PanelGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-10 -top-10 h-40 w-40 animate-[pos-blob-drift-a_16s_ease-in-out_infinite] rounded-full bg-crimson-500/20 blur-3xl" />
      <div className="absolute -bottom-12 -right-8 h-48 w-48 animate-[pos-blob-drift-b_20s_ease-in-out_infinite] rounded-full bg-[#FFC145]/25 blur-3xl" />
      <div className="absolute bottom-1/3 left-1/4 h-28 w-28 animate-[pos-blob-drift-c_18s_ease-in-out_infinite] rounded-full bg-flame-500/20 blur-3xl" />
    </div>
  );
}

// Each offering "type" gets its own accent throughout the catalogue grid —
// folder = crimson, item = flame orange, service = gold — so the three read
// as genuinely distinct families rather than the same orange tinted three ways.
type IconColor = "flame" | "crimson" | "gold" | "white";
const ICON_COLOR_CLASS: Record<IconColor, string> = {
  flame: "text-flame-600",
  crimson: "text-[#E11D2E]",
  gold: "text-[#F5A623]",
  white: "text-white",
};

function FolderIcon({ large, color = "crimson" }: { large?: boolean; color?: IconColor }) {
  const size = large ? "h-8 w-8" : "h-4 w-4";
  return (
    <svg className={`${size} ${ICON_COLOR_CLASS[color]}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinejoin="round" />
    </svg>
  );
}

function SparkleIcon({ color = "gold" }: { color?: IconColor } = {}) {
  return (
    <svg className={`h-8 w-8 ${ICON_COLOR_CLASS[color]}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function BoxGlyph({ color = "crimson" }: { color?: IconColor } = {}) {
  return (
    <svg className={`h-8 w-8 ${ICON_COLOR_CLASS[color]}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** One twinkling 4-point star — the "sparks" scattered across a catalogue
 *  card's banner. Reuses the existing twinkle keyframe (opacity only) with a
 *  per-instance delay/duration so a cluster of them never blinks in unison. */
function Spark({ className = "", delay = 0, duration = 2.6 }: { className?: string; delay?: number; duration?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`animate-twinkle text-white ${className}`}
      style={{ animationDelay: `${delay}s`, "--dur": `${duration}s` } as React.CSSProperties}
      fill="currentColor"
    >
      <path d="M12 2l1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8z" />
    </svg>
  );
}

/** Small halftone dot-grid, tucked into a banner corner for texture. */
function DotGrid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute opacity-40 ${className}`}
      style={{ backgroundImage: "radial-gradient(circle, white 1.4px, transparent 1.4px)", backgroundSize: "9px 9px" }}
    />
  );
}

/**
 * The section break between the category pill row and the folder/offering
 * grid below it — a glowing trapezoid "screen" bar (a hint of perspective
 * via clip-path) with a pulsing ambient light spill beneath it and a
 * traveling scan-line shine across it, instead of a plain border/line.
 */
function SectionScreenDivider() {
  return (
    <div aria-hidden="true" className="relative my-2 flex h-7 items-center justify-center">
      <div className="absolute inset-x-6 top-1/2 h-6 -translate-y-1/2 animate-soft-pulse rounded-full bg-gradient-to-r from-red-500/25 via-orange-400/35 to-yellow-300/25 blur-xl" />
      <div
        className="relative h-2 w-full overflow-hidden bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 shadow-[0_0_18px_2px_rgba(255,140,0,0.55)]"
        style={{ clipPath: "polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)" }}
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-[140%] animate-[shimmer-sweep_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 -top-0.5 h-0.5 bg-gradient-to-r from-transparent via-black/15 to-transparent" />
    </div>
  );
}

/** The little document glyph in a Folder card's "X offering(s)" row. */
function ListRowIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3.5h9l3 3V20a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6" strokeLinecap="round" />
    </svg>
  );
}

/** The little price-tag glyph in an Item/Service card's price row. */
function PriceTagRowIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M11.3 3.5H5a1.5 1.5 0 00-1.5 1.5v6.3c0 .4.16.78.44 1.06l8.6 8.6a1.5 1.5 0 002.12 0l6.3-6.3a1.5 1.5 0 000-2.12l-8.6-8.6a1.5 1.5 0 00-1.06-.44z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CashIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="6" width="19" height="12" rx="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      <path d="M5.5 9v0M18.5 15v0" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

type CatalogueCardTheme = {
  banner: string;
  border: string;
  glow: string;
  pill: string;
  rowBg: string;
  rowText: string;
  iconColor: IconColor;
};

const CATALOGUE_CARD_THEME: Record<"folder" | "item" | "service", CatalogueCardTheme> = {
  folder: {
    banner: "from-orange-300 via-orange-400 to-red-500",
    border: "from-orange-400 via-orange-500 to-red-500",
    glow: "bg-orange-400/45",
    pill: "from-orange-400 to-red-500",
    rowBg: "bg-orange-50",
    rowText: "text-orange-700",
    iconColor: "flame",
  },
  item: {
    banner: "from-rose-300 via-rose-400 to-red-500",
    border: "from-rose-400 via-rose-500 to-red-500",
    glow: "bg-rose-400/45",
    pill: "from-rose-400 to-red-500",
    rowBg: "bg-rose-50",
    rowText: "text-rose-700",
    iconColor: "crimson",
  },
  service: {
    banner: "from-amber-300 via-amber-400 to-[#F5A623]",
    border: "from-amber-400 via-[#F5A623] to-[#D97706]",
    glow: "bg-[#F5A623]/45",
    pill: "from-amber-400 to-[#F5A623]",
    rowBg: "bg-amber-50",
    rowText: "text-[#B45309]",
    iconColor: "gold",
  },
};

/**
 * One shared card shell for Folder / Item / Service in the catalogue grid —
 * colored banner (icon, sparks, dot-grid, wave seam) over a white body
 * (title and a secondary row for either the folder's offering count or the
 * item/service's price). Folder, Item, and Service differ only by `theme`,
 * `icon`, and the row content — the structure itself is identical, per the
 * reference this was built from.
 */
function CatalogueCard({
  onClick,
  disabled,
  iconKind,
  title,
  tamilName,
  theme,
  rowIcon,
  rowLabel,
  extraBadges,
}: {
  onClick: () => void;
  disabled?: boolean;
  iconKind: "folder" | "item" | "service";
  title: string;
  tamilName?: string;
  theme: CatalogueCardTheme;
  rowIcon: React.ReactNode;
  rowLabel: string;
  extraBadges?: React.ReactNode;
}) {
  const bigIcon =
    iconKind === "folder" ? <FolderIcon large color={theme.iconColor} /> : iconKind === "service" ? <SparkleIcon color={theme.iconColor} /> : <BoxGlyph color={theme.iconColor} />;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative rounded-[26px] bg-gradient-to-br ${theme.border} p-[2.5px] text-left shadow-[0_12px_30px_-18px_rgba(0,0,0,0.4)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:scale-[1.03] hover:shadow-[0_26px_50px_-18px_rgba(0,0,0,0.45)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:shadow-none`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[23.5px] bg-white">
        <div className={`relative h-[72px] overflow-hidden bg-gradient-to-br bg-[length:220%_220%] animate-[flame-wave_9s_ease-in-out_infinite] ${theme.banner}`}>
          <DotGrid className="bottom-1.5 left-2 h-8 w-8" />
          <Spark className="left-6 top-2.5 h-2.5 w-2.5" delay={0} duration={2.4} />
          <Spark className="right-7 top-5 h-3 w-3" delay={0.7} duration={3} />
          <Spark className="bottom-6 right-10 h-2 w-2" delay={1.4} duration={2.2} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -translate-x-[140%] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[140%]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span aria-hidden="true" className="absolute h-12 w-12 animate-soft-pulse rounded-full bg-white/50 blur-xl" />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/25 ring-[3px] ring-white/50">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_10px_24px_-8px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-110">
                {bigIcon}
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5 px-3 py-2.5">
          <div>
            <p className="text-[14.5px] font-bold leading-tight text-ink-100">{title}</p>
            {tamilName && <p className="text-[11px] text-ink-500">{tamilName}</p>}
          </div>
          {extraBadges && <div className="flex flex-wrap items-center gap-1.5">{extraBadges}</div>}
          <div className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 ${theme.rowBg}`}>
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_-2px_rgba(0,0,0,0.2)]">
                {rowIcon}
              </span>
              <span className={`text-[12.5px] font-semibold ${theme.rowText}`}>{rowLabel}</span>
            </span>
            <ChevronIcon className={`-rotate-90 ${theme.rowText}`} />
          </div>
        </div>
      </div>
    </button>
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

  // Item and Service each get their own accent family (rose vs. gold)
  // instead of sharing one look, matching Folder's orange — three offering
  // "types" throughout the catalogue now read as visibly distinct.
  const isService = offering.refType === "Service";
  const theme = isService ? CATALOGUE_CARD_THEME.service : CATALOGUE_CARD_THEME.item;

  return (
    <CatalogueCard
      onClick={() => onPick(offering)}
      disabled={outOfStock}
      iconKind={isService ? "service" : "item"}
      title={offering.name}
      tamilName={offering.tamilName}
      theme={theme}
      rowIcon={<PriceTagRowIcon className={theme.rowText} />}
      rowLabel={formatCurrency(offering.salePrice)}
      extraBadges={
        <>
          {outOfStock && (
            <span className="rounded-full border border-crimson-500/30 bg-crimson-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-crimson-500">
              Out of Stock
            </span>
          )}
          {!outOfStock && lowStock && (
            <span className="rounded-full border border-flame-500/30 bg-flame-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-flame-500">
              Low Stock
            </span>
          )}
        </>
      }
    />
  );
}

function CartLineRow({ line, onEdit, onRemove }: { line: CartLine; onEdit: () => void; onRemove: () => void }) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-[0_2px_10px_-6px_rgba(255,122,46,0.25)] transition-shadow duration-200 ${line.quantityExceedsStock ? "border-crimson-500/30 bg-crimson-500/5" : "border-orange-200/60 bg-white/70 hover:shadow-[0_8px_20px_-14px_rgba(255,122,46,0.5)]"}`}
    >
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
          <span className="whitespace-nowrap bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FF8C1A] bg-clip-text text-[13px] font-semibold text-transparent">
            {formatCurrency(line.lineTotal ?? line.unitPrice * line.quantity)}
          </span>
          {line.offering && (
            <button
              onClick={onEdit}
              aria-label={`Edit ${line.name}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-700/20 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600 text-white shadow-[0_2px_5px_-1px_rgba(37,99,235,0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-3px_rgba(37,99,235,0.6)] active:translate-y-0"
            >
              <PencilIcon />
            </button>
          )}
          <button
            onClick={onRemove}
            aria-label={`Remove ${line.name}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-700/20 bg-gradient-to-b from-red-400 via-red-500 to-red-600 text-white shadow-[0_2px_5px_-1px_rgba(220,38,38,0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-3px_rgba(220,38,38,0.6)] active:translate-y-0"
          >
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
  devoteeNameSuggestions,
  quantity,
  onQuantityChange,
  total,
  isEditing,
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
  devoteeNameSuggestions?: string[];
  quantity: number;
  onQuantityChange: (v: number) => void;
  total: number;
  isEditing?: boolean;
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
          className="pointer-events-auto flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_30px_80px_-20px_rgba(179,39,63,0.35)]"
        >
          <div aria-hidden="true" className="h-1.5 shrink-0 bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FFC145]" />
          <div className="flex items-start justify-between border-b border-gold-500/10 px-6 py-5">
            <div>
              {isEditing && <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-600">Editing cart line</p>}
              <h2 className="font-accent text-[19px] font-extrabold tracking-tight text-ink-100">{offering.name}</h2>
              {offering.tamilName && <p className="text-[13px] text-ink-500">{offering.tamilName}</p>}
            </div>
            <button onClick={onCancel} aria-label="Close" className="rounded-lg p-1.5 text-ink-500 hover:bg-ivory-100">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {offering.isDeityMappingRequired && deityOptions.length === 0 && (
              <div className="rounded-xl border border-crimson-500/30 bg-crimson-500/5 px-4 py-3">
                <p className="text-[13px] font-medium text-crimson-500">Deity is not configured</p>
                <p className="mt-1 text-[12px] text-crimson-500">
                  This offering requires a deity selection, but no deities have been configured for it in the master. You
                  can&rsquo;t proceed with booking until that&rsquo;s set up.
                </p>
              </div>
            )}

            {offering.isDeityMappingRequired && deityOptions.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">Deities (Multi-Select) *</p>
                <div className="flex flex-wrap gap-2">
                  {deityOptions.map((d) => {
                    const selected = deities.includes(d._id);
                    return (
                      <button
                        key={d._id}
                        type="button"
                        onClick={() => toggleDeity(d._id)}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-[transform,box-shadow,background-color,color,border-color] duration-200 hover:-translate-y-0.5 ${
                          selected
                            ? "border-transparent bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FFC145] text-white shadow-[0_8px_18px_-8px_rgba(255,122,46,0.55)]"
                            : "border-orange-200/70 bg-white/70 text-ink-300 shadow-[0_2px_10px_-6px_rgba(255,122,46,0.3)] hover:border-flame-500/70 hover:bg-white/90 hover:text-flame-600 hover:shadow-[0_8px_18px_-10px_rgba(255,122,46,0.45)]"
                        }`}
                      >
                        <AnimatePresence initial={false}>
                          {selected && (
                            <motion.span
                              initial={{ width: 0, opacity: 0 }}
                              animate={{ width: "auto", opacity: 1 }}
                              exit={{ width: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="flex items-center overflow-hidden"
                            >
                              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </motion.span>
                          )}
                        </AnimatePresence>
                        {d.name}
                      </button>
                    );
                  })}
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
                  containerClassName={FIELD_ACCENT}
                />
              </div>
            )}

            {offering.isFamilyMembersRequired && devoteeRows > 0 && (
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-wide text-amber-600">
                  Devotee Details (max {offering.maxFamilyMembers}) *
                </p>
                {devoteeNameSuggestions && devoteeNameSuggestions.length > 0 && (
                  <datalist id="devotee-name-suggestions">
                    {devoteeNameSuggestions.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                )}
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
                      list={devoteeNameSuggestions && devoteeNameSuggestions.length > 0 ? "devotee-name-suggestions" : undefined}
                      autoComplete="off"
                      containerClassName={FIELD_ACCENT}
                    />
                    <DivineListbox
                      label="Nakshatra"
                      value={devotee.nakshatra}
                      onChange={(v) => {
                        const updated = [...devotees];
                        updated[idx] = { ...updated[idx], nakshatra: v };
                        onDevoteesChange(updated);
                      }}
                      options={nakshatraOptions}
                      placeholder="Nakshatra"
                      containerClassName={FIELD_ACCENT}
                    />
                    {devotees.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveDevotee(idx)}
                        aria-label="Remove family member"
                        className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-700/20 bg-gradient-to-b from-red-400 via-red-500 to-red-600 text-white shadow-[0_2px_5px_-1px_rgba(220,38,38,0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-3px_rgba(220,38,38,0.6)] active:translate-y-0"
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
              <span className="bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FF8C1A] bg-clip-text font-bold text-transparent">
                {formatCurrency(total)}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-gold-500/30 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-ink-300 transition-[border-color,color] duration-200 hover:border-flame-500/60 hover:text-flame-600"
              >
                Cancel
              </button>
              <FlameActionButton
                icon={<PlusIcon />}
                chevron={false}
                onClick={onConfirm}
                disabled={offering.isDeityMappingRequired && deities.length === 0}
              >
                {isEditing ? "Save Changes" : "Add to Cart"}
              </FlameActionButton>
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
              <DivineInput
                label="Full Name"
                icon={<UserIcon />}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!matched}
                containerClassName={FIELD_ACCENT}
              />
              <DivineInput
                label="Email"
                icon={<MailIcon />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!matched}
                containerClassName={FIELD_ACCENT}
              />
              <DivineInput
                label="Mobile Number"
                icon={<PhoneIcon />}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                hint={checkingMobile ? "Checking…" : undefined}
                containerClassName={FIELD_ACCENT}
              />
              <DivineDatePicker
                label="Date of birth"
                value={dateOfBirth}
                onChange={setDateOfBirth}
                placeholder="Not recorded"
                containerClassName={FIELD_ACCENT}
              />
              <DivineListbox
                label="Gender"
                value={gender}
                onChange={setGender}
                options={CREATE_CUSTOMER_GENDER_OPTIONS}
                disabled={!!matched}
                containerClassName={FIELD_ACCENT}
              />
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
          className="pointer-events-auto flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_30px_80px_-20px_rgba(179,39,63,0.35)]"
        >
          <div className="flex items-start justify-between border-b border-gold-500/10 px-6 py-5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-500">Order No.</p>
              <h2 className="text-[15px] font-bold tabular-nums text-ink-100">
                {booking.orderNumber ?? booking.bookingNumber}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-500">{formatTempleDateTime(booking.bookedAt)}</p>
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
 * Blocks adding to the cart before a customer is on file — center-screen
 * rather than the earlier approach of letting the add through and only
 * nudging the search box afterward, so the miss is caught before it
 * happens instead of after.
 */
function CustomerRequiredNotice({ onClose }: { onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-white/60 bg-white text-center shadow-[0_30px_80px_-20px_rgba(179,39,63,0.35)]"
        >
          <div aria-hidden="true" className="h-1.5 shrink-0 bg-gradient-to-r from-crimson-600 via-flame-500 to-[#FFC145]" />
          <div className="px-6 py-7">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-flame-500/30 bg-flame-500/10 text-flame-600">
              <UserIcon />
            </span>
            <h2 className="font-accent text-[17px] font-extrabold tracking-tight text-ink-100">Select a customer first</h2>
            <p className="mt-1.5 text-[13px] text-ink-500">Choose or create a customer above before adding items to the cart.</p>
          </div>
          <div className="px-6 pb-6">
            <FlameActionButton icon={<UserIcon />} chevron={false} onClick={onClose} className="w-full justify-center">
              Got It
            </FlameActionButton>
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
        <FlameActionButton icon={<PlusIcon />} chevron={false} onClick={onNewTransaction} className="w-full justify-center">
          New Transaction
        </FlameActionButton>
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
