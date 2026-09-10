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

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  api,
  unwrap,
  extractErrorMessage,
  type ApiEnvelope,
} from "../../lib/api";
import { toast } from "../../lib/toastStore";
import { useAuthStore, endSession } from "../../lib/authStore";
import { USER_TYPE_LABEL } from "../../lib/userTypes";
import TempleClock from "../admin/TempleClock";
import NetsStatusWidget from "./NetsStatusWidget";
import { PosCustomerDisplayDock } from "./PosCustomerDisplayPage";
import { usePosDisplayPublisher } from "../../lib/usePosDisplayPublisher";
import { SuccessModal } from "./SuccessModal";
import { IDLE_DISPLAY, type PosDisplayPayload } from "../../lib/posDisplay";
import netsSocketService, { normalizeRealtimeStatus } from "../../lib/netsSocketService";
import { formatTempleDateTime, getTempleTimeParts } from "../../lib/datetime";
import { sanitizeMobileInput, isValidSgMobile, SG_MOBILE_ERROR } from "../../lib/mobileNumber";
import DivineInput from "../divine/DivineInput";
import DivineButton from "../divine/DivineButton";
import { StayOnPageWarning } from "../divine/StatusBanner";
import { EmblemLoader, EmblemLoaderOverlay } from "../divine/EmblemLoader";
import { resolveImageUrl } from "../../lib/imageUrl";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineDatePicker from "../divine/DivineDatePicker";
import { FORM_LABEL } from "../divine/formFieldStyles";
import {
  SearchIcon,
  TrashIcon,
  PencilIcon,
  CartIcon,
  UserIcon,
  PhoneIcon,
  MailIcon,
  PlusIcon,
  MinusIcon,
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
const POS_BTN_ON =
  "border-[#7c1527] bg-[#7c1527] text-white hover:bg-[#681221]";
const POS_BTN_OFF =
  "border-[#7c1527]/30 bg-white text-ink-100 hover:border-[#7c1527]/55 hover:bg-[#faf6f1] hover:text-[#7c1527]";

const POS_PANEL =
  "overflow-hidden rounded-2xl border border-[#7c1527]/30 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.28),0_6px_16px_-6px_rgba(124,21,39,0.32)]";

const CUSTOMER_SECTION_BG = "/customer_section_bg.webp";

/** Fills the panel shell and stays put — the photo lives outside the
 *  scrolling body so recent bookings / cart lines can scroll over it. */
function SectionPhotoBg({ mirror = false }: { mirror?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className={`h-full min-h-full w-full bg-cover bg-center bg-no-repeat ${mirror ? "-scale-x-100" : ""}`}
        style={{ backgroundImage: `url('${CUSTOMER_SECTION_BG}')` }}
      />
      <div className="absolute inset-0 bg-white/40" />
    </div>
  );
}

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

type CategoryTab = { _id: string; name: string; color: string; count: number; image?: string | null };
type Folder = {
  // Every category this folder's contents span — a folder is keyed by
  // Sub Category alone (no parent Category at the master level), so an
  // Item under one category and a Service under another can share a
  // "Daily" folder instead of duplicating it.
  categoryIds: string[];
  subCategoryId: string;
  subCategoryName: string;
  subCategoryTamilName?: string | null;
  color: string | null;
  image?: string | null;
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
  image?: string | null;
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
  image?: string | null;
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
  | ({ refType: "Service" } & Omit<PosService, "defaultSalePrice"> & {
        salePrice: number;
      });

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
  _id: string;
  bookingNumber: string;
  orderNumber: string;
  referenceId: string;
  receiptNo: string | null;
  customer: Customer;
  lines: CartLine[];
  grandTotal: number;
  paymentModeName: string;
  paymentStatus: "paid" | "partial" | "pending";
  amountPaid: number;
  balanceAmount: number;
};

// Response shape of POST /pos/booking/bookings/:id/payments — patches a
// BookingConfirmation in place after collecting another installment, and
// (receiptNo/amount/paymentModeName) backs the success popup that confirms
// it (see BookingSuccessView's "Pay Again").
type RecordPaymentResult = {
  receiptNo: string;
  amount: number;
  paymentModeName: string;
  paymentStatus: "paid" | "partial" | "pending";
  amountPaid: number;
  balanceAmount: number;
};

// The server, not the browser, decides when an order actually counts as
// paid — POST /orders returns a confirmed booking outright for Cash, and
// leaves any other payment mode "pending" until a real confirmation lands
// server-side (today: nothing does yet; eventually a payment gateway's own
// webhook). Both endpoints share this shape so the frontend never has to
// special-case which one handed it a confirmed booking.
// PayNow's QR now comes back embedded directly in the order-create response
// instead of requiring a second call to POST /payments/paynow/generate-qr —
// present (non-null) exactly when the order was created under PayNow and
// the server managed to build a QR for it in the same request.
// paymentDetailsError is set instead on the rare case that succeeded but
// this didn't (config incomplete, a render failure) — the order itself is
// still valid and has a referenceId, so the frontend falls back to the
// standalone route with it rather than losing the order.
// `referenceId` here is the PENDING TRANSACTION's own fresh per-attempt
// reference — NOT the order's own `referenceId` alongside it below. Every
// PayNow QR (this order's first payment, or any later top-up) must embed
// its own never-reused reference, or a second live QR against the same
// booking risks being refused/mis-reconciled by the bank for reusing a
// reference it already saw settle once — see backend's confirmPosPayment.
type PaynowPaymentDetails = { referenceId: string; amount: number; qr: string; engine: string };
type CreateOrderResult =
  | ({ status: "confirmed" } & BookingConfirmation)
  | {
      status: "pending";
      _id: string;
      referenceId: string;
      grandTotal: number;
      paymentDetails: PaynowPaymentDetails | null;
      paymentDetailsError: string | null;
    };
type OrderStatusResult = ({ status: "confirmed" } & BookingConfirmation) | { status: "pending" | "cancelled" | "expired" };

// PayNow's own settlement is asynchronous and has no fixed timeline (the
// customer has to open their banking app and scan) — this stays open until
// the customer cancels or it actually confirms, so there's no attempt-cap
// the way the generic ORDER_POLL_MAX_ATTEMPTS below has for Cash's
// near-instant confirm. Matches the "check every 3 seconds" cadence a real
// payment-status poll should use — fast enough to feel live, not so fast
// it hammers the server while someone's still fumbling for their phone.
const PAYNOW_POLL_INTERVAL_MS = 3000;

const ORDER_POLL_INTERVAL_MS = 1500;
const ORDER_POLL_MAX_ATTEMPTS = 40; // ~60s — comfortably under the order's own 30-minute hold

/**
 * Polls the read-only order-status endpoint until the server reports the
 * order confirmed, rather than the frontend ever asserting that itself.
 * `basePath` is "/pos/booking/orders" or "/pos/admin/booking/orders"
 * depending on which portal is checking out.
 */
async function pollOrderStatus(basePath: string, orderId: string): Promise<BookingConfirmation> {
  for (let attempt = 0; attempt < ORDER_POLL_MAX_ATTEMPTS; attempt++) {
    const res = await api.get<ApiEnvelope<OrderStatusResult>>(`${basePath}/${orderId}/status`);
    const data = unwrap(res);
    if (data.status === "confirmed") return data;
    if (data.status === "cancelled") throw new Error("This order was cancelled before payment could be confirmed.");
    if (data.status === "expired") throw new Error("The booking hold expired before payment was confirmed. Please start again.");
    await new Promise((resolve) => setTimeout(resolve, ORDER_POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for the booking to be confirmed. Please check Transaction History.");
}

let lineCounter = 0;
function newLineId() {
  return `line-${++lineCounter}`;
}

function formatCurrency(v: number) {
  return `$${v.toFixed(2)}`;
}

function recentTxnStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" };
  const parts = getTempleTimeParts(date);
  return {
    date: parts.date,
    time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`,
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PosPortalPage() {
  const user = useAuthStore((s) => s.user);

  // ── customer ──────────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);

  // ── catalogue ────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<CategoryTab[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [uncategorizedItems, setUncategorizedItems] = useState<PosItem[]>([]);
  const [uncategorizedServices, setUncategorizedServices] = useState<
    PosService[]
  >([]);
  const [catalogueTotalCount, setCatalogueTotalCount] = useState(0);
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

  const totalOfferingCount =
    catalogueTotalCount ||
    folders.length + uncategorizedItems.length + uncategorizedServices.length;

  async function loadCatalogue() {
    setCatalogueLoading(true);
    try {
      const r = await api.get<
        ApiEnvelope<{
          categories: CategoryTab[];
          totalCount?: number;
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
      setCatalogueTotalCount(data.totalCount ?? 0);
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
    () =>
      selectedCategoryId
        ? folders.filter((f) => f.categoryIds.includes(selectedCategoryId))
        : folders,
    [folders, selectedCategoryId],
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
      // Folders are keyed by Sub Category alone (see the Folder type) — an
      // item and a service sharing a folder can each be tagged to a
      // different Category, so fetching its contents can only filter by
      // subCategory, not by any one category.
      api.get<ApiEnvelope<{ items: PosItem[] }>>("/pos/booking/items", {
        params: { subCategory: activeFolder.subCategoryId, pageSize: 100 },
      }),
      api.get<ApiEnvelope<{ items: PosService[] }>>("/pos/booking/services", {
        params: { subCategory: activeFolder.subCategoryId, pageSize: 100 },
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
          params: {
            search: offeringSearch,
            category: selectedCategoryId || undefined,
            pageSize: 50,
          },
        }),
        api.get<ApiEnvelope<{ items: PosService[] }>>("/pos/booking/services", {
          params: {
            search: offeringSearch,
            category: selectedCategoryId || undefined,
            pageSize: 50,
          },
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
      .get<ApiEnvelope<{ items: NakshatraOption[] }>>(
        "/pos/booking/nakshathirams",
      )
      .then((r) =>
        setNakshatraOptions(
          unwrap(r).items.map((n) => ({ value: n.name, label: n.name })),
        ),
      )
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
        cart.map((l) => ({
          refType: l.refType,
          refId: l.refId,
          quantity: l.quantity,
          deities: l.deities,
          devotees: l.devotees,
        })),
      ),
    [cart],
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
        const r = await api.post<ApiEnvelope<SummaryResponse>>(
          "/pos/booking/summary",
          {
            customerId: selectedCustomer._id,
            lines: cart.map((l) => ({
              refType: l.refType,
              refId: l.refId,
              quantity: l.quantity,
              deities: l.deities,
              devotees: l.devotees,
            })),
          },
        );
        const data = unwrap(r);
        setSummary(data);
        setCart((prev) =>
          prev.map((line, idx) => {
            const sl = data.lines[idx];
            if (!sl || sl.refId !== line.refId || sl.refType !== line.refType) return line;
            return {
              ...line,
              lineTotal: sl.lineTotal,
              inventory: sl.inventory,
              quantityExceedsStock: sl.quantityExceedsStock,
            };
          }),
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

  // ── partial payment ─────────────────────────────────────────────────────
  // How much is being collected right now, as a string so the field can be
  // freely edited. Re-seeded to "pay in full" whenever the priced total
  // changes — a cashier who wants to take less than that edits it down
  // themselves; this only decides the default.
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  useEffect(() => {
    if (summary) setPaymentAmountInput(summary.grandTotal.toFixed(2));
  }, [summary?.grandTotal]);

  const paymentAmount = Number(paymentAmountInput);
  const isPartialPayment =
    paymentAmountInput !== "" &&
    !Number.isNaN(paymentAmount) &&
    summary != null &&
    paymentAmount < summary.grandTotal;
  const paymentBalanceAmount = summary
    ? Math.max(0, +(summary.grandTotal - (Number.isNaN(paymentAmount) ? 0 : paymentAmount)).toFixed(2))
    : 0;
  const paymentAmountValid =
    summary != null &&
    paymentAmountInput !== "" &&
    !Number.isNaN(paymentAmount) &&
    paymentAmount >= 0 &&
    paymentAmount <= summary.grandTotal;

  // ── customer search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedCustomer || customerQuery.trim().length < 2) {
      setCustomerResults([]);
      setCustomerSearching(false);
      return;
    }
    setCustomerSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await api.get<ApiEnvelope<{ items: Customer[] }>>(
          "/pos/booking/customers/search",
          {
            params: { query: customerQuery.trim() },
          },
        );
        if (!cancelled) setCustomerResults(unwrap(r).items);
      } catch {
        if (!cancelled) setCustomerResults([]);
      } finally {
        if (!cancelled) setCustomerSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customerQuery, selectedCustomer]);

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

  // Adding to the cart no longer requires picking a customer first — if
  // nobody's been selected by the time an item is added, the booking goes
  // under the signed-in staff member's own profile instead (find-or-create,
  // idempotent server-side), the same account temple staff already get for
  // booking a pooja for their own family.
  async function resolveSelfCustomer(): Promise<Customer | null> {
    try {
      const r = await api.get<ApiEnvelope<Customer>>(
        "/pos/booking/customers/self",
      );
      return unwrap(r);
    } catch (err) {
      toast.error(extractErrorMessage(err));
      return null;
    }
  }

  // ── recent transactions (repeat a past booking) ─────────────────────────
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [viewingRecentBooking, setViewingRecentBooking] =
    useState<RecentBooking | null>(null);
  const [recheckingCart, setRecheckingCart] = useState(false);
  const [unavailableLines, setUnavailableLines] = useState<
    RecheckedLine[] | null
  >(null);
  const [pendingAvailableLines, setPendingAvailableLines] = useState<
    RecheckedLine[]
  >([]);

  useEffect(() => {
    if (!selectedCustomer) {
      setRecentBookings([]);
      return;
    }
    api
      .get<ApiEnvelope<{ items: RecentBooking[] }>>(
        `/pos/booking/customers/${selectedCustomer._id}/recent-bookings`,
        {
          params: { limit: 3 },
        },
      )
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
      const r = await api.post<ApiEnvelope<{ lines: RecheckedLine[] }>>(
        "/pos/booking/recheck-lines",
        {
          lines: booking.lines.map((l) => ({
            refType: l.refType,
            refId: l.refId,
            quantity: l.quantity,
            deities: l.deities.map((d) => d._id),
            devotees: l.devotees,
          })),
        },
      );
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
      toast.created(
        `${pendingAvailableLines.length} available item(s) added to cart.`,
      );
    }
    setUnavailableLines(null);
    setPendingAvailableLines([]);
    setViewingRecentBooking(null);
  }

  // ── add-to-cart modal ───────────────────────────────────────────────────
  const [modalOffering, setModalOffering] = useState<Offering | null>(null);
  const [modalDeities, setModalDeities] = useState<string[]>([]);
  const [modalDevotees, setModalDevotees] = useState<Devotee[]>([
    { name: "", nakshatra: "" },
  ]);
  const [modalQuantity, setModalQuantity] = useState(1);
  // Set while editing an existing cart line instead of adding a new one —
  // confirmAddToCart() branches on this to update in place rather than append.
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [cartNotice, setCartNotice] = useState<{ name: string; kind: "added" | "updated" } | null>(null);

  async function openAddModal(offering: Offering) {
    if (!selectedCustomer) {
      const self = await resolveSelfCustomer();
      if (!self) return;
      selectCustomer(self);
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
    const startRows = offering.isFamilyMembersRequired
      ? Math.max(1, offering.maxFamilyMembers || 1)
      : 1;
    setModalDevotees(
      Array.from({ length: startRows }, () => ({ name: "", nakshatra: "" })),
    );
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
    const startRows = offering.isFamilyMembersRequired
      ? Math.max(1, offering.maxFamilyMembers || 1)
      : 1;
    const rows = Array.from(
      { length: Math.max(startRows, line.devotees.length) },
      (_, i) => line.devotees[i] ?? { name: "", nakshatra: "" },
    );
    setModalDevotees(rows);
    setModalQuantity(line.quantity);
  }

  const modalDevoteeRows = modalOffering?.isFamilyMembersRequired
    ? modalDevotees.length
    : 0;
  // Deity-mapped offerings must have their own curated deityMapping — an
  // empty list means the master was never configured with deities, not
  // "any deity goes", so this deliberately does NOT fall back to the full
  // active roster (deityOptions) any more. The modal shows a blocking note
  // instead of a deity picker when this is empty (see AddToCartModal).
  const modalDeityChoices = modalOffering?.deityMapping ?? [];

  // Devotees the selected customer has already booked for, across their
  // last 3 confirmed bookings (recentBookings is already limited to that) —
  // shown as one-tap suggestion chips in the devotee details form, name AND
  // nakshatra together, deduplicated by name (first-seen nakshatra wins;
  // a devotee's nakshatra doesn't change booking to booking).
  const devoteeNameSuggestions = useMemo(() => {
    const seen = new Map<string, Devotee>();
    for (const booking of recentBookings) {
      for (const line of booking.lines) {
        for (const devotee of line.devotees) {
          const trimmed = devotee.name.trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.set(trimmed, { name: trimmed, nakshatra: devotee.nakshatra });
          }
        }
      }
    }
    return Array.from(seen.values());
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

  // A deity picker only makes sense when the offering actually has deities
  // curated for it — isDeityMappingRequired with an empty roster used to
  // dead-end the sale behind a blocking note. Falling back to the plain
  // quantity flow instead means an admin forgetting to curate deities never
  // blocks a real transaction at the counter.
  const modalHasDeityChoices = Boolean(modalOffering?.isDeityMappingRequired) && modalDeityChoices.length > 0;
  const modalEffectiveQty = modalHasDeityChoices ? modalDeities.length || 0 : modalQuantity;
  const modalTotal = modalOffering ? modalOffering.salePrice * modalEffectiveQty : 0;

  function confirmAddToCart() {
    if (!modalOffering) return;
    if (modalHasDeityChoices && modalDeities.length === 0) {
      toast.error("Please select at least one deity.");
      return;
    }
    // A blank row (an unused slot) is fine — the row count is a cap, not a
    // mandatory headcount. A name entered without its Nakshatra is caught
    // by AddToCartModal before onConfirm (this function) is ever called.
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
                unitPrice: modalOffering.salePrice,
                lineTotal: modalOffering.salePrice * (modalEffectiveQty || 1),
                deities: modalDeities,
                devotees: modalOffering.isFamilyMembersRequired
                  ? filledDevotees
                  : [],
                offering: modalOffering,
              }
            : l,
        ),
      );
      setModalOffering(null);
      setEditingLineId(null);
      setCartNotice({ name: modalOffering.name, kind: "updated" });
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
      lineTotal: modalOffering.salePrice * (modalEffectiveQty || 1),
      deities: modalDeities,
      devotees: modalOffering.isFamilyMembersRequired ? filledDevotees : [],
      offering: modalOffering,
    };
    setCart((prev) => [...prev, newLine]);
    setModalOffering(null);
    setCartNotice({ name: modalOffering.name, kind: "added" });
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
  const [paymentPopupOpen, setPaymentPopupOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(
    null,
  );
  // Set once a PayNow order is created and its QR generated — presence of
  // this (rather than a separate boolean) is what drives PaynowQrModal's
  // `open` prop, so there's never a modal shown with nothing to render.
  const [paynowQr, setPaynowQr] = useState<{ orderId: string; referenceId: string; amount: number; qrImage: string } | null>(
    null,
  );
  // Set once a NETS order is created and the terminal payment initiated —
  // same "presence drives the modal" convention as paynowQr above. See
  // NetsPaymentModal's own comment for the socket-driven flow this opens.
  // `manual` marks an instance opened via the "Manual Confirm" button on
  // Collect Payment — the pending transaction is created exactly the same
  // way, but NetsPaymentModal skips sending anything to the terminal and
  // opens straight into the transaction-ref-number entry form instead of
  // narrating an auto flow that was never started.
  const [netsPayment, setNetsPayment] = useState<{ orderId: string; referenceId: string; amount: number; manual?: boolean } | null>(
    null,
  );
  // Same "presence drives the modal" convention, for Credit Card — a
  // separate state (not a `kind` field bolted onto netsPayment) so it's
  // impossible for a leftover NETS payment to accidentally reopen as a
  // Credit Card modal or vice versa.
  const [creditCardPayment, setCreditCardPayment] = useState<{ orderId: string; referenceId: string; amount: number; manual?: boolean } | null>(
    null,
  );
  const [successDisplay, setSuccessDisplay] = useState<PosDisplayPayload | null>(null);
  const { code: displayCode, error: displayError, publish: publishCustomerDisplay } = usePosDisplayPublisher();

  function finalizeBooking(booking: BookingConfirmation) {
    setConfirmation(booking);
    setStep("done");
    toast.created(
      booking.paymentStatus === "paid"
        ? `Booking ${booking.bookingNumber} confirmed!`
        : `Booking ${booking.bookingNumber} confirmed with a partial payment — ${formatCurrency(booking.balanceAmount)} still due.`,
    );
    printTicketForBooking(booking);
  }

  // NETS and Credit Card both already print on their own inside the EXE the
  // moment the terminal approves (index.js's confirmAndPrintNetsPayment,
  // which fires for any genuinely-approved terminal payment regardless of
  // paymentType/isCreditTxn) — asking again here would just be a wasted
  // duplicate round trip, so both are skipped. Cash and PayNow have no such
  // hook today; this is the only place their ticket ever gets printed.
  // Fire-and-forget and silent on failure (EXE not running, no printer yet,
  // socket not connected) — the booking itself already succeeded and must
  // never be blocked or alarmed by a printing hiccup; the EXE's own
  // pending-print queue picks up a "no printer configured" case
  // automatically once one is set up.
  function printTicketForBooking(booking: BookingConfirmation) {
    const modeName = booking.paymentModeName.toLowerCase();
    if (modeName === "nets" || modeName === "credit card") return;
    void (async () => {
      try {
        const res = await api.get<ApiEnvelope<unknown>>(`/pos/booking/bookings/${booking._id}/ticket-groups`);
        const ticketData = unwrap(res);
        netsSocketService.printTicket(
          { orderId: booking.referenceId, ticketData, paymentMethod: booking.paymentModeName.toUpperCase() },
          (ack) => {
            if (ack.status !== "success") {
              console.warn("Ticket print request was not accepted by the Nets-Service EXE:", ack.error || ack.message);
            }
          },
        );
      } catch (err) {
        console.warn("Could not fetch ticket data for printing:", err);
      }
    })();
  }

  const hasStockIssues = cart.some((l) => l.quantityExceedsStock);
  const canProceed =
    selectedCustomer && cart.length > 0 && !hasStockIssues && !summaryLoading;
  const cashMode = paymentModes.find((m) => m.name.toLowerCase() === "cash");
  const selectedModeName =
    paymentModes.find((m) => m._id === selectedPaymentModeId)?.name ?? "CASH";
  // Items are sitting in the cart with nobody to book them for — call it
  // out right at the search box instead of only at the disabled checkout
  // button, which is easy to miss until the very end.
  const needsCustomerForCart = cart.length > 0 && !selectedCustomer;

  function openPaymentPopup() {
    if (!selectedCustomer) {
      toast.error("Select a customer above to proceed.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Add an item or service to the cart to proceed.");
      return;
    }
    if (hasStockIssues) {
      toast.error("Some items have insufficient stock. Please adjust quantities.");
      return;
    }
    if (summary) setPaymentAmountInput(summary.grandTotal.toFixed(2));
    setPaymentPopupOpen(true);
  }

  async function handleConfirmBooking(opts: { manual?: boolean } = {}) {
    if (!selectedCustomer) {
      toast.error("No customer selected.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Cart is empty.");
      return;
    }
    if (!selectedPaymentModeId) {
      toast.error("Please select a payment mode.");
      return;
    }
    if (summary?.hasStockIssues) {
      toast.error(
        "Some items have insufficient stock. Please adjust quantities.",
      );
      return;
    }
    if (!paymentAmountValid) {
      toast.error(`Enter a payment amount between $0.00 and ${formatCurrency(summary?.grandTotal ?? 0)}.`);
      return;
    }

    setBookingLoading(true);
    try {
      // Only ever creates the order — never separately asserts that
      // payment succeeded. The server decides that itself, from the
      // resolved payment mode: Cash comes back already confirmed in this
      // same response; anything else stays "pending" until a real
      // confirmation lands server-side, and is picked up by polling below.
      const orderRes = await api.post<ApiEnvelope<CreateOrderResult>>(
        "/pos/booking/orders",
        {
          customerId: selectedCustomer._id,
          lines: cart.map((l) => ({
            refType: l.refType,
            refId: l.refId,
            quantity: l.quantity,
            deities: l.deities,
            devotees: l.devotees,
          })),
          paymentModeId: selectedPaymentModeId,
          paidAmount: paymentAmount,
        },
      );
      const created = unwrap(orderRes);

      if (created.status === "confirmed") {
        setPaymentPopupOpen(false);
        finalizeBooking(created);
        return;
      }

      if (selectedModeName.toLowerCase() === "paynow") {
        // The order-create response above already carries the QR — built
        // server-side in the same request (controllers/pos-orders'
        // buildPaynowQrForOrder) — so there's normally no second network
        // round trip needed at all here. Don't poll yet either way: let
        // PaynowQrModal own the poll for as long as it's open (see its own
        // comment for why this can't use the fixed-attempt pollOrderStatus()
        // below — PayNow settlement has no fixed timeline, the customer has
        // to go find their phone and scan).
        let details = created.paymentDetails;
        if (!details) {
          // Rare fallback: the order itself was created fine but the server
          // couldn't build a QR for it in that same request (config
          // incomplete, a render error) — created.paymentDetailsError names
          // why. The order still has a valid referenceId, so retry QR
          // generation on its own via the standalone route rather than
          // losing the order the customer already has reserved inventory
          // against.
          const qrRes = await api.post<ApiEnvelope<{ referenceId: string; amount: number; qrImage: string }>>(
            "/payments/paynow/generate-qr",
            { referenceId: created.referenceId, amount: paymentAmount },
          );
          const qr = unwrap(qrRes);
          details = { referenceId: qr.referenceId, amount: qr.amount, qr: qr.qrImage, engine: "" };
        }
        setPaymentPopupOpen(false);
        // details.referenceId — the pending transaction's own per-attempt
        // reference, embedded in the QR itself — not created.referenceId
        // (the order's stable identity). See PaynowPaymentDetails' own comment.
        setPaynowQr({ orderId: created._id, referenceId: details.referenceId, amount: details.amount, qrImage: details.qr });
        return;
      }

      if (selectedModeName.toLowerCase() === "nets") {
        // Fixes the amount and creates the PENDING transaction the terminal
        // result will confirm — see controllers/pos-orders' initiateNetsPayment
        // on the backend. Unlike PayNow, there's no QR to show; the
        // referenceId/amount this returns is what NetsPaymentModal sends
        // straight to the physical (or, with simulation on, simulated)
        // terminal over the socket connection.
        const initRes = await api.post<ApiEnvelope<{ referenceId: string; amount: number; currency: string }>>(
          `/pos/booking/orders/${created._id}/nets/initiate`,
          { amount: paymentAmount },
        );
        const init = unwrap(initRes);
        setPaymentPopupOpen(false);
        setNetsPayment({ orderId: created._id, referenceId: init.referenceId, amount: init.amount, manual: opts.manual });
        return;
      }

      if (selectedModeName.toLowerCase() === "credit card") {
        // Mirrors the NETS branch above exactly — same terminal, same
        // pending-transaction/confirm flow, just Credit Card's own initiate
        // route and PAYMENT_MESSAGE-watching modal (see NetsPaymentModal's
        // kind prop).
        const initRes = await api.post<ApiEnvelope<{ referenceId: string; amount: number; currency: string }>>(
          `/pos/booking/orders/${created._id}/credit-card/initiate`,
          { amount: paymentAmount },
        );
        const init = unwrap(initRes);
        setPaymentPopupOpen(false);
        setCreditCardPayment({ orderId: created._id, referenceId: init.referenceId, amount: init.amount, manual: opts.manual });
        return;
      }

      const booking = await pollOrderStatus("/pos/booking/orders", created._id);
      setPaymentPopupOpen(false);
      finalizeBooking(booking);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBookingLoading(false);
    }
  }

  function handlePaynowConfirmed(booking: BookingConfirmation) {
    setPaynowQr(null);
    finalizeBooking(booking);
  }

  function cancelPaynowQr() {
    // The order itself is left exactly as it was — still "pending", still
    // holding inventory for the rest of its 30-minute window. Closing this
    // modal only stops watching it; nothing here cancels the order, so
    // re-opening Collect Payment for the same cart and picking PayNow again
    // is still safe (a fresh order, a fresh QR — the abandoned one simply
    // expires on its own if never paid).
    setPaynowQr(null);
  }

  function handleNetsConfirmed(booking: BookingConfirmation) {
    setNetsPayment(null);
    finalizeBooking(booking);
  }

  function cancelNetsPayment() {
    // Same reasoning as cancelPaynowQr — the order/pending transaction are
    // left exactly as they are; this only stops watching. A genuinely
    // still-in-flight terminal payment (rare — the terminal itself has its
    // own timeout) isn't cancelled by closing this modal.
    setNetsPayment(null);
  }

  function handleCreditCardConfirmed(booking: BookingConfirmation) {
    setCreditCardPayment(null);
    finalizeBooking(booking);
  }

  function cancelCreditCardPayment() {
    setCreditCardPayment(null);
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
    setPaymentAmountInput("");
    setPaymentPopupOpen(false);
    setPaynowQr(null);
    setNetsPayment(null);
    setCreditCardPayment(null);
    setSuccessDisplay(null);
    lineCounter = 0;
    const cash = paymentModes.find((m) => m.name.toLowerCase() === "cash");
    setSelectedPaymentModeId(cash?._id ?? "");
  }

  const customerDisplayPayload = useMemo((): PosDisplayPayload => {
    const lines = (step === "done" && confirmation ? confirmation.lines : cart).map((l) => ({
      name: l.name,
      quantity: l.quantity,
      lineTotal: l.lineTotal ?? l.unitPrice * l.quantity,
    }));
    const grandTotal = step === "done" && confirmation ? confirmation.grandTotal : (summary?.grandTotal ?? 0);
    const customerName = selectedCustomer?.name ?? confirmation?.customer?.name ?? null;

    if (step === "done" && confirmation) {
      if (successDisplay) return successDisplay;
      return {
        phase: "done",
        customerName,
        lines,
        grandTotal,
        payingNow: confirmation.amountPaid,
        amountPaid: confirmation.amountPaid,
        balanceDue: confirmation.balanceAmount,
        bookingNumber: confirmation.bookingNumber,
        paymentStatus: confirmation.paymentStatus,
        mode: confirmation.paymentModeName,
      };
    }

    if (paynowQr) {
      return {
        phase: "paynow",
        customerName,
        lines,
        grandTotal,
        payingNow: paynowQr.amount,
        balanceDue: Math.max(0, +(grandTotal - paynowQr.amount).toFixed(2)),
        mode: "PAYNOW",
        qrImage: paynowQr.qrImage,
        referenceId: paynowQr.referenceId,
      };
    }

    if (netsPayment || creditCardPayment) {
      const terminal = netsPayment ?? creditCardPayment;
      return {
        phase: "terminal",
        customerName,
        lines,
        grandTotal,
        payingNow: terminal!.amount,
        balanceDue: Math.max(0, +(grandTotal - terminal!.amount).toFixed(2)),
        mode: netsPayment ? "NETS" : "CREDIT CARD",
        referenceId: terminal!.referenceId,
        statusMessage: "Please complete payment on the terminal.",
      };
    }

    if (paymentPopupOpen && summary) {
      return {
        phase: "collecting",
        customerName,
        lines,
        grandTotal: summary.grandTotal,
        payingNow: Number.isNaN(paymentAmount) ? 0 : paymentAmount,
        balanceDue: paymentBalanceAmount,
        mode: selectedModeName,
      };
    }

    if (cart.length > 0) {
      return {
        phase: "cart",
        customerName,
        lines,
        grandTotal,
        payingNow: 0,
        balanceDue: 0,
      };
    }

    return IDLE_DISPLAY;
  }, [
    step,
    confirmation,
    successDisplay,
    cart,
    summary,
    selectedCustomer,
    paynowQr,
    netsPayment,
    creditCardPayment,
    paymentPopupOpen,
    paymentAmount,
    paymentBalanceAmount,
    selectedModeName,
  ]);

  useEffect(() => {
    publishCustomerDisplay(customerDisplayPayload);
  }, [customerDisplayPayload, publishCustomerDisplay]);

  // ─────────────────────────────────────────────────────────────────────────

  if (step === "done" && confirmation) {
    return (
      <PosShell user={user} onNewTransaction={startNewTransaction} displayCode={displayCode} displayError={displayError}>
        <BookingSuccessView
          confirmation={confirmation}
          paymentModes={paymentModes}
          onNewTransaction={startNewTransaction}
          onDisplayState={setSuccessDisplay}
          onPaymentRecorded={(result) =>
            setConfirmation((prev) => (prev ? { ...prev, ...result } : prev))
          }
        />
      </PosShell>
    );
  }

  const showingSearch = offeringSearch.trim().length > 0;
  const showingFolder = !showingSearch && activeFolder;

  return (
    <PosShell user={user} onNewTransaction={startNewTransaction} displayCode={displayCode} displayError={displayError}>
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-2 sm:gap-4 sm:p-3 md:grid-cols-2 lg:h-full lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,2.5fr)_minmax(210px,0.78fr)] lg:overflow-hidden lg:p-4 xl:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(230px,300px)]">
        {/* ── LEFT: customer panel ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -48, rotateY: 14 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className={`relative flex min-h-[210px] max-h-[min(46vh,24rem)] w-full flex-col ${POS_PANEL} md:col-start-1 md:row-start-1 md:max-h-[min(50vh,28rem)] lg:h-full lg:max-h-none lg:min-h-0`}
        >
          <SectionPhotoBg />
          <div className="relative z-10 flex shrink-0 items-center bg-[#7c1527] px-4 py-3">
            <p className="flex items-center gap-2 font-accent text-[16px] font-extrabold tracking-tight text-white">
              <UserIcon /> Customer
            </p>
          </div>
          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {!selectedCustomer && <PanelGlow />}
          <div
            className={`relative rounded-xl transition-shadow duration-300 ${needsCustomerForCart ? "shadow-[0_0_0_3px_rgba(220,38,38,0.25)]" : ""}`}
          >
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
                        transition={{
                          repeat: Infinity,
                          duration: 1.8,
                          delay,
                          ease: "easeOut",
                        }}
                        className="absolute inset-0 rounded-xl border-2"
                        style={{ borderColor: color }}
                      />
                    ))}
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: [0, -6, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{
                      y: { repeat: Infinity, duration: 1.1, ease: "easeInOut" },
                      opacity: { duration: 0.2 },
                    }}
                    className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2"
                  >
                    <svg
                      className="h-7 w-7 drop-shadow-[0_2px_5px_rgba(220,38,38,0.45)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      strokeWidth="2.5"
                    >
                      <defs>
                        <linearGradient
                          id="customerArrowGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
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
              staticLabel
              iconPosition="start"
              label="Search customer"
              placeholder="Search by name, mobile or email"
              icon={<SearchIcon />}
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                if (selectedCustomer) clearCustomer();
              }}
              disabled={!!selectedCustomer}
              loading={customerSearching}
            />
            <AnimatePresence>
              {(customerSearching || customerResults.length > 0) && !selectedCustomer && (
                <motion.ul
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-orange-200 bg-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.2)]"
                >
                  {customerSearching && customerResults.length === 0 && (
                    <li className="flex items-center gap-2 px-3 py-2.5 text-[12.5px] text-ink-500">
                      <svg className="h-3.5 w-3.5 animate-spin text-amber-600" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                      </svg>
                      Searching…
                    </li>
                  )}
                  {customerResults.map((c) => (
                    <li
                      key={c._id}
                      onClick={() => selectCustomer(c)}
                      className="cursor-pointer border-b border-slate-200 bg-white px-3 py-2.5 last:border-0 hover:bg-ivory-50"
                    >
                      <p className="text-[13px] font-medium text-ink-100">
                        {c.name}
                      </p>
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
            <div className="space-y-1 rounded-md border border-orange-200 bg-white px-3 py-2.5">
              <p className="text-[13px] font-medium text-ink-100">
                {selectedCustomer.name}
              </p>
              <p className="text-[11.5px] text-ink-500">
                {selectedCustomer.customerCode}
              </p>
              {selectedCustomer.mobileNumber && (
                <p className="flex items-center gap-1 text-[11.5px] text-ink-500">
                  <PhoneIcon /> {selectedCustomer.mobileNumber}
                </p>
              )}
              <button
                onClick={clearCustomer}
                className="text-[11.5px] text-crimson-500 hover:underline"
              >
                Change customer
              </button>
            </div>
          ) : (
            <FlameActionButton
              icon={<UserIcon />}
              chevron={false}
              onClick={() => setCreateCustomerOpen(true)}
              className="w-full justify-center"
            >
              Create Customer
            </FlameActionButton>
          )}

          {selectedCustomer && recentBookings.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c1527]">
                  <HistoryIcon /> Recent Transactions
                </p>
                <span className="rounded-full bg-[#7c1527]/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#7c1527]">
                  {recentBookings.length}
                </span>
              </div>
              {recentBookings.map((b) => {
                const stamp = recentTxnStamp(b.bookedAt);
                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => setViewingRecentBooking(b)}
                    className="group w-full overflow-hidden rounded-lg border border-[#f0b4a0]/80 bg-white text-left shadow-[0_4px_14px_-8px_rgba(124,21,39,0.28)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#7c1527]/40 hover:shadow-[0_12px_24px_-12px_rgba(124,21,39,0.4)]"
                  >
                    <span className="flex">
                      <span aria-hidden className="w-1 shrink-0 bg-[#7c1527]" />
                      <span className="min-w-0 flex-1 px-3 py-2.5">
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-[#7c1527]/70">
                              Booking no.
                            </span>
                            <span className="mt-0.5 block truncate text-[12.5px] font-bold tabular-nums text-ink-100">
                              {b.bookingNumber}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-[#7c1527]/70">
                              Amount
                            </span>
                            <span className="mt-0.5 inline-block rounded-md bg-[#7c1527] px-2 py-0.5 text-[12.5px] font-bold tabular-nums text-white">
                              {formatCurrency(b.grandTotal)}
                            </span>
                          </span>
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-md bg-[#faf6f1] px-1.5 py-0.5 text-[10px] font-medium text-ink-300">
                            {stamp.date}
                          </span>
                          <span className="rounded-md bg-[#faf6f1] px-1.5 py-0.5 text-[10px] font-medium text-ink-300">
                            {stamp.time}
                          </span>
                          <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            {b.lines.length} {b.lines.length === 1 ? "item" : "items"}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </motion.div>

        {/* ── CENTER: catalogue ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 40, rotateX: 12 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.06 }}
          className={`relative order-2 flex min-h-[22rem] w-full min-w-0 flex-col ${POS_PANEL} bg-white md:order-3 md:col-span-2 lg:order-none lg:col-span-1 lg:h-full lg:min-h-0`}
        >
          <div className="shrink-0 space-y-2 p-3 pb-2">
            <DivineInput
              staticLabel
              iconPosition="start"
              label="Search offerings"
              placeholder="Search by name or code"
              icon={<SearchIcon />}
              value={offeringSearch}
              onChange={(e) => setOfferingSearch(e.target.value)}
              loading={searchLoading}
            />
            <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1.5 [scrollbar-width:thin]">
              <button
                onClick={() => {
                  setSelectedCategoryId("");
                  setActiveFolder(null);
                }}
                className={`inline-flex h-11 shrink-0 items-center rounded-xl border px-3.5 text-[12.5px] font-medium shadow-sm transition-[box-shadow,background-color,color,border-color] duration-200 hover:shadow-[0_6px_16px_-4px_rgba(124,21,39,0.4)] sm:h-12 ${
                  !selectedCategoryId ? POS_BTN_ON : POS_BTN_OFF
                }`}
              >
                All Categories ({totalOfferingCount})
              </button>
              {categories.map((c) => {
                const catImg = resolveImageUrl(c.image);
                return (
                <button
                  key={c._id}
                  onClick={() => {
                    setSelectedCategoryId(c._id);
                    setActiveFolder(null);
                  }}
                  className={`inline-flex h-11 shrink-0 items-center gap-2.5 rounded-xl border py-1 pl-1.5 pr-3.5 text-[12.5px] font-medium shadow-sm transition-[box-shadow,background-color,color,border-color] duration-200 hover:shadow-[0_6px_16px_-4px_rgba(124,21,39,0.4)] sm:h-12 ${
                    selectedCategoryId === c._id ? POS_BTN_ON : POS_BTN_OFF
                  }`}
                >
                  {catImg ? (
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10">
                      <img
                        src={catImg}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </span>
                  ) : null}
                  {c.name} ({c.count})
                </button>
                );
              })}
            </div>
          </div>

          <SectionScreenDivider />

          <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
            {catalogueLoading && (
              <div className="flex justify-center py-10">
                <EmblemLoader size="md" label="Loading catalogue…" />
              </div>
            )}

            {!catalogueLoading && showingSearch && (
              <>
                {searchLoading && (
                  <div className="flex justify-center py-8">
                    <EmblemLoader size="sm" label="Searching…" />
                  </div>
                )}
                {!searchLoading &&
                  searchItems.length === 0 &&
                  searchServices.length === 0 && (
                    <p className="py-8 text-center text-[13px] text-ink-500">
                      No offerings match &ldquo;{offeringSearch}&rdquo;.
                    </p>
                  )}
                {!searchLoading &&
                  (searchItems.length > 0 || searchServices.length > 0) && (
                    <OfferingGrid
                      items={searchItems}
                      services={searchServices}
                      onPick={openAddModal}
                    />
                  )}
              </>
            )}

            {!catalogueLoading &&
              !showingSearch &&
              showingFolder &&
              activeFolder && (
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
                    <div className="flex justify-center py-8">
                      <EmblemLoader size="sm" label="Loading…" />
                    </div>
                  ) : (
                    <OfferingGrid
                      items={folderItems}
                      services={folderServices}
                      onPick={openAddModal}
                    />
                  )}
                </div>
              )}

            {!catalogueLoading && !showingSearch && !showingFolder && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleFolders.map((f) => (
                  <CatalogueCard
                    key={f.subCategoryId}
                    onClick={() => openFolder(f)}
                    iconKind="folder"
                    title={f.subCategoryName}
                    tamilName={f.subCategoryTamilName ?? undefined}
                    imageUrl={f.image}
                    theme={CATALOGUE_CARD_THEME.folder}
                    rowIcon={
                      <ListRowIcon
                        className={CATALOGUE_CARD_THEME.folder.rowText}
                      />
                    }
                    rowLabel={`${f.total} ${f.total === 1 ? "offering" : "offerings"}`}
                  />
                ))}
                {visibleUncategorizedServices.map((s) => (
                  <OfferingCard
                    key={s._id}
                    offering={{
                      refType: "Service",
                      salePrice: s.defaultSalePrice,
                      ...s,
                    }}
                    onPick={openAddModal}
                  />
                ))}
                {visibleUncategorizedItems.map((i) => (
                  <OfferingCard
                    key={i._id}
                    offering={{ refType: "Item", ...i }}
                    onPick={openAddModal}
                  />
                ))}
                {visibleFolders.length === 0 &&
                  visibleUncategorizedItems.length === 0 &&
                  visibleUncategorizedServices.length === 0 && (
                    <p className="col-span-full py-12 text-center text-[13px] text-ink-500">
                      No offerings in this category yet.
                    </p>
                  )}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── RIGHT: cart ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: 48, rotateY: -14 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.12 }}
          className={`relative order-3 flex min-h-[240px] max-h-[min(50vh,28rem)] w-full flex-col ${POS_PANEL} md:order-2 md:col-start-2 md:row-start-1 md:max-h-[min(50vh,28rem)] lg:order-none lg:col-start-auto lg:row-start-auto lg:h-full lg:max-h-none lg:min-h-0`}
        >
          <SectionPhotoBg mirror />
          <div className="relative z-10 flex shrink-0 items-center justify-between bg-[#7c1527] px-4 py-3">
            <p className="flex items-center gap-2 font-accent text-[16px] font-extrabold tracking-tight text-white">
              <CartIcon /> Cart{" "}
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-semibold text-white">
                {cart.length}
              </span>
            </p>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                aria-label="Clear cart"
                className="flex items-center gap-1.5 rounded-md border border-white bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#7c1527] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#fde8ec] hover:text-[#7c1527]"
              >
                <TrashIcon /> Clear Cart
              </button>
            )}
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col p-4">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden py-10 text-center">
                  <PanelGlow />
                  <span className="relative z-0 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_8px_18px_-6px_rgba(255,122,46,0.4)]">
                    <CartIcon />
                  </span>
                  <p className="text-[13px] font-medium text-ink-300">
                    No items or services added
                  </p>
                  <p className="text-[11.5px] text-ink-500">
                    Select an offering to begin the transaction.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 px-0.5 py-1">
                  <AnimatePresence initial={false}>
                    {cart.map((line) => (
                      <motion.div
                        key={line.id}
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{
                          opacity: 0,
                          scale: 0.96,
                          transition: { duration: 0.15 },
                        }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <CartLineRow
                          line={line}
                          onEdit={() => openEditModal(line)}
                          onRemove={() => removeCartLine(line.id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="relative z-10 mt-3 shrink-0 border-t-2 border-orange-200/80 pt-3 shadow-[0_-6px_16px_-8px_rgba(0,0,0,0.12)]">
              <div className="flex items-center justify-between text-[13px] font-bold text-ink-100">
                <span className="flex items-center gap-1.5">
                  Total Payable (S$)
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
                    GST Inclusive
                  </span>
                </span>
                <span className="text-[#7c1527]">
                  {formatCurrency(summary?.grandTotal ?? 0)}
                </span>
              </div>

              {hasStockIssues && (
                <p className="mt-2 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-[11.5px] text-crimson-500">
                  One or more lines exceed available stock.
                </p>
              )}

              {!canProceed && !hasStockIssues && (
                <p className="mt-2 rounded-lg bg-crimson-500/10 py-2 text-center text-[11.5px] font-medium text-crimson-500">
                  {!selectedCustomer
                    ? "Select a customer above to proceed."
                    : cart.length === 0
                      ? "Add an item or service to the cart to proceed."
                      : "Calculating totals…"}
                </p>
              )}

              <div className="mt-3">
                <FlameActionButton
                  icon={<LockIcon />}
                  chevron={false}
                  onClick={openPaymentPopup}
                  disabled={!canProceed || bookingLoading}
                  className="w-full justify-center"
                >
                  Proceed to Payment
                </FlameActionButton>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <ProceedPaymentModal
        open={paymentPopupOpen}
        onClose={() => setPaymentPopupOpen(false)}
        total={summary?.grandTotal ?? 0}
        modes={paymentModes}
        modeId={selectedPaymentModeId}
        onModeChange={setSelectedPaymentModeId}
        amountInput={paymentAmountInput}
        onAmountChange={setPaymentAmountInput}
        amountValid={paymentAmountValid}
        isPartial={isPartialPayment}
        balance={paymentBalanceAmount}
        modeName={selectedModeName}
        loading={bookingLoading}
        onConfirm={() => handleConfirmBooking()}
        onManualConfirm={() => handleConfirmBooking({ manual: true })}
      />

      <PaynowQrModal
        open={!!paynowQr}
        referenceId={paynowQr?.referenceId ?? ""}
        amount={paynowQr?.amount ?? 0}
        qrImage={paynowQr?.qrImage ?? ""}
        onPoll={async () => {
          const res = await api.get<ApiEnvelope<OrderStatusResult>>(`/pos/booking/orders/${paynowQr?.orderId}/status`);
          const data = unwrap(res);
          return { status: data.status, data };
        }}
        onConfirmed={(data) => handlePaynowConfirmed(data as BookingConfirmation)}
        onCancel={cancelPaynowQr}
      />

      <NetsPaymentModal
        open={!!netsPayment}
        referenceId={netsPayment?.referenceId ?? ""}
        amount={netsPayment?.amount ?? 0}
        onPoll={async () => {
          const res = await api.get<ApiEnvelope<OrderStatusResult>>(`/pos/booking/orders/${netsPayment?.orderId}/status`);
          const data = unwrap(res);
          return { status: data.status, data };
        }}
        onConfirmed={(data) => handleNetsConfirmed(data as BookingConfirmation)}
        onCancel={cancelNetsPayment}
        startInManualMode={!!netsPayment?.manual}
        onManualConfirm={async (transactionRefNo) => {
          try {
            await api.post(`/pos/booking/manual-confirm`, {
              referenceId: netsPayment?.referenceId,
              transactionRefNo,
            });
          } catch (err) {
            throw new Error(extractErrorMessage(err));
          }
        }}
      />

      <NetsPaymentModal
        open={!!creditCardPayment}
        kind="CREDIT_CARD"
        referenceId={creditCardPayment?.referenceId ?? ""}
        amount={creditCardPayment?.amount ?? 0}
        onPoll={async () => {
          const res = await api.get<ApiEnvelope<OrderStatusResult>>(`/pos/booking/orders/${creditCardPayment?.orderId}/status`);
          const data = unwrap(res);
          return { status: data.status, data };
        }}
        onConfirmed={(data) => handleCreditCardConfirmed(data as BookingConfirmation)}
        onCancel={cancelCreditCardPayment}
        startInManualMode={!!creditCardPayment?.manual}
        onManualConfirm={async (transactionRefNo) => {
          try {
            await api.post(`/pos/booking/manual-confirm`, {
              referenceId: creditCardPayment?.referenceId,
              transactionRefNo,
            });
          } catch (err) {
            throw new Error(extractErrorMessage(err));
          }
        }}
      />

      <CreateCustomerModal
        open={createCustomerOpen}
        onClose={() => setCreateCustomerOpen(false)}
        onCreated={(c) => {
          selectCustomer(c);
          setCreateCustomerOpen(false);
        }}
      />

      <RecentBookingModal
        open={!!viewingRecentBooking}
        booking={viewingRecentBooking}
        loading={recheckingCart}
        onClose={() => setViewingRecentBooking(null)}
        onAddToCart={() => viewingRecentBooking && addRecentBookingToCart(viewingRecentBooking)}
      />

      <UnavailableLinesDialog
        open={!!unavailableLines}
        unavailableLines={unavailableLines}
        availableCount={pendingAvailableLines.length}
        onCancel={() => {
          setUnavailableLines(null);
          setPendingAvailableLines([]);
        }}
        onProceed={confirmAddAvailableOnly}
      />

      <AddToCartModal
        open={!!modalOffering}
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

      <AddedToCartPopup notice={cartNotice} onClear={() => setCartNotice(null)} />
      <EmblemLoaderOverlay show={bookingLoading} label="Confirming payment…" className="z-[75]" />
    </PosShell>
  );
}

// ─── shell (top bar) ──────────────────────────────────────────────────────────

function PosShell({
  user,
  onNewTransaction,
  displayCode,
  displayError,
  children,
}: {
  user: ReturnType<typeof useAuthStore.getState>["user"];
  onNewTransaction?: () => void;
  displayCode?: string;
  displayError?: string | null;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRefMobile = useRef<HTMLDivElement>(null);
  const menuRefDesktop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        menuRefMobile.current?.contains(target) ||
        menuRefDesktop.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="pos-flame-canvas relative flex h-screen w-full flex-col overflow-hidden">
      <AnimatePresence>{signingOut && <SignOutOverlay />}</AnimatePresence>
      <NetsStatusWidget />
      <div
        aria-hidden="true"
        className="h-1.5 shrink-0 bg-dark-orange"
      />
      {/* auto/1fr/auto, not 1fr/auto/1fr — the logo and the clock+profile
          block each take exactly their own content width (they were never
          going to match each other), and the flexible track goes entirely
          to the space between them. With two 1fr tracks flanking a fixed
          middle, an unequal-width side (the clock+profile block is wider
          than the logo) still claims its own real width — grid's default
          `minmax(auto, 1fr)` never lets a 1fr track shrink below its
          content — so the two "equal" tracks came out unequal anyway,
          and the toolbar between them centered on the wrong midpoint. */}
      <header className="relative z-20 flex shrink-0 flex-col gap-2 border-b border-gold-400/40 bg-gradient-to-r from-[#FFFCF7] via-[#FFF3DE] to-[#FFE9C7] px-2 py-2 shadow-[0_8px_28px_-8px_rgba(179,39,63,0.28)] backdrop-blur-md sm:px-4 sm:py-2.5 lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-3 lg:px-6 lg:py-3">
        {/* Glow is clipped here so it doesn't leak; the header itself must
            stay overflow-visible or the account menu is cut off by Cart. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
          <span className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-flame-400/15 blur-3xl" />
        </div>
        <div className="relative flex min-w-0 items-center justify-between gap-2 lg:justify-start">
          <motion.img
            src="/SSD_Full_Logo.webp"
            alt="Sri Siva Durga Temple"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="h-11 w-auto max-w-[min(100%,220px)] shrink-0 object-contain sm:h-14 sm:max-w-[260px] lg:h-[68px] lg:max-w-[320px]"
          />
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 lg:hidden">
            <div className="hidden sm:block">
              <TempleClock variant="flame" />
            </div>
            <div className="relative z-30" ref={menuRefMobile}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dark-orange text-[12px] font-semibold text-white">
                  {user ? initials(user.name) : "?"}
                </span>
                <ChevronIcon
                  className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-gold-500/20 bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)]"
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
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          <FlameActionButton
            icon={<HistoryIcon />}
            chevron={false}
            tone="muted"
            onClick={() => toast.error("Transaction History isn't built yet.")}
          >
            Transaction History
          </FlameActionButton>
          <FlameActionButton
            icon={<PrinterIcon />}
            chevron={false}
            tone="muted"
            onClick={() => toast.error("Reprint isn't built yet.")}
          >
            Reprint
          </FlameActionButton>
          {onNewTransaction && (
            <FlameActionButton
              icon={<PlusIcon />}
              tone="muted"
              onClick={onNewTransaction}
            >
              New Transaction
            </FlameActionButton>
          )}
          {displayCode !== undefined && <PosCustomerDisplayDock code={displayCode} error={displayError} />}
        </div>

        <div className="hidden min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3 lg:flex">
          <div className="hidden sm:block">
            <TempleClock variant="flame" />
          </div>
          <div className="relative z-30" ref={menuRefDesktop}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/60"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dark-orange text-[12px] font-semibold text-white">
                {user ? initials(user.name) : "?"}
              </span>
              <span className="hidden text-left lg:block">
                <span className="block text-[12.5px] leading-tight text-ink-100">
                  {user?.name ?? "Unknown"}
                </span>
                <span className="block text-[10.5px] leading-tight text-ink-500">
                  {user
                    ? (USER_TYPE_LABEL[user.userType] ?? user.userType)
                    : ""}
                </span>
              </span>
              <ChevronIcon
                className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-gold-500/20 bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)]"
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

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
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
      <EmblemLoader size="md" label="Signing you out…" />
    </motion.div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

/**
 * The pill-shaped action button used across the counter screen's topbar,
 * Customer panel, and Cart footer — an icon badge, a divider, and a bold
 * label on the same solid dark-orange as admin CTAs (or solid crimson for
 * Clear Cart).
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
  tone?: "flame" | "crimson" | "subtle" | "muted";
  className?: string;
}) {
  if (tone === "muted") {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileHover={disabled ? undefined : { y: -3 }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        className={`group relative flex items-center gap-2.5 overflow-hidden rounded-md border border-[#ead9c6] bg-white px-3.5 py-1.5 text-[#7a3d1a] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-[box-shadow,background-color,border-color] duration-200 hover:border-[#d4b08a] hover:bg-[#faf6f1] hover:shadow-[0_4px_12px_-6px_rgba(122,61,26,0.18)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#f6e4d4]">
          {icon}
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-[#ead9c6]" />
        <span className="relative whitespace-nowrap text-[13px] font-semibold">
          {children}
        </span>
        {chevron && (
          <ChevronIcon className="relative ml-auto -rotate-90 opacity-70" />
        )}
      </motion.button>
    );
  }

  // "subtle" — a plain, professional pill (white, thin border, tinted icon
  // badge, no sparks/shimmer/glow) for spots that don't need the loud
  // gradient treatment — currently just the header's utility actions.
  if (tone === "subtle") {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileHover={disabled ? undefined : { y: -3 }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        className={`group relative flex items-center gap-2.5 overflow-hidden rounded-md border border-gold-500/25 bg-ivory-50 px-3.5 py-1.5 text-ink-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-[box-shadow,border-color,background-color] duration-200 hover:border-flame-400/50 hover:bg-gold-100 hover:shadow-[0_4px_12px_-6px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-flame-500/10 text-flame-600">
          {icon}
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-gold-500/20" />
        <span className="whitespace-nowrap text-[13px] font-semibold">
          {children}
        </span>
        {chevron && <ChevronIcon className="ml-auto -rotate-90 text-ink-400" />}
      </motion.button>
    );
  }

  const fillBg =
    tone === "crimson"
      ? "border-crimson-600 bg-crimson-600 hover:bg-crimson-500"
      : "border-[#7c1527] bg-[#7c1527] hover:bg-[#681221]";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -3 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-md border ${fillBg} px-3.5 py-1.5 text-white shadow-[0_6px_14px_-8px_rgba(124,21,39,0.45)] transition-[box-shadow,background-color] duration-200 hover:shadow-[0_10px_20px_-10px_rgba(124,21,39,0.5)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="pos-btn-shine absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 group-hover:opacity-100" />
      </span>
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black/15">
        {icon}
      </span>
      <span aria-hidden="true" className="relative h-4 w-px bg-white/35" />
      <span className="relative whitespace-nowrap text-[13px] font-bold">
        {children}
      </span>
      {chevron && (
        <ChevronIcon className="relative ml-auto -rotate-90 text-white/90" />
      )}
    </motion.button>
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
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <div className="absolute -left-10 -top-10 h-40 w-40 animate-[pos-blob-drift-a_16s_ease-in-out_infinite] rounded-full bg-crimson-500/20 blur-3xl" />
      <div className="absolute -bottom-12 -right-8 h-48 w-48 animate-[pos-blob-drift-b_20s_ease-in-out_infinite] rounded-full bg-[#FFC145]/25 blur-3xl" />
      <div className="absolute bottom-1/3 left-1/4 h-28 w-28 animate-[pos-blob-drift-c_18s_ease-in-out_infinite] rounded-full bg-flame-500/20 blur-3xl" />
    </div>
  );
}

const POS_SPARKS = [
  { lx: "6%", ly: "94%", tx: "28vw", ty: "-62vh", c: "#ffd23f", sz: "7px", delay: "0s", dur: "1.15s" },
  { lx: "18%", ly: "96%", tx: "18vw", ty: "-58vh", c: "#ff7a2e", sz: "5px", delay: "0.12s", dur: "1.05s" },
  { lx: "32%", ly: "98%", tx: "8vw", ty: "-64vh", c: "#fff6d6", sz: "6px", delay: "0.22s", dur: "1.25s" },
  { lx: "48%", ly: "97%", tx: "-4vw", ty: "-66vh", c: "#ffc36b", sz: "8px", delay: "0.08s", dur: "1.1s" },
  { lx: "62%", ly: "95%", tx: "-16vw", ty: "-60vh", c: "#ff7a2e", sz: "5px", delay: "0.28s", dur: "1.2s" },
  { lx: "78%", ly: "96%", tx: "-26vw", ty: "-63vh", c: "#ffd23f", sz: "7px", delay: "0.16s", dur: "1.08s" },
  { lx: "90%", ly: "93%", tx: "-34vw", ty: "-55vh", c: "#fff", sz: "4px", delay: "0.34s", dur: "0.95s" },
  { lx: "2%", ly: "70%", tx: "36vw", ty: "-28vh", c: "#ff9d42", sz: "6px", delay: "0.4s", dur: "1.3s" },
  { lx: "96%", ly: "68%", tx: "-38vw", ty: "-24vh", c: "#ffd23f", sz: "6px", delay: "0.18s", dur: "1.18s" },
  { lx: "10%", ly: "40%", tx: "22vw", ty: "18vh", c: "#fff6d6", sz: "4px", delay: "0.5s", dur: "1.4s" },
  { lx: "88%", ly: "38%", tx: "-20vw", ty: "16vh", c: "#ff7a2e", sz: "5px", delay: "0.26s", dur: "1.22s" },
  { lx: "24%", ly: "8%", tx: "10vw", ty: "42vh", c: "#ffd23f", sz: "5px", delay: "0.44s", dur: "1.12s" },
  { lx: "70%", ly: "6%", tx: "-12vw", ty: "46vh", c: "#ffc36b", sz: "6px", delay: "0.1s", dur: "1.28s" },
  { lx: "42%", ly: "4%", tx: "2vw", ty: "50vh", c: "#fff", sz: "4px", delay: "0.36s", dur: "1.06s" },
  { lx: "55%", ly: "92%", tx: "-8vw", ty: "-48vh", c: "#b3273f", sz: "5px", delay: "0.2s", dur: "1.16s" },
] as const;

function PosSparkField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {POS_SPARKS.map((s, i) => (
        <span
          key={i}
          className="pos-spark"
          style={
            {
              "--lx": s.lx,
              "--ly": s.ly,
              "--tx": s.tx,
              "--ty": s.ty,
              "--c": s.c,
              "--sz": s.sz,
              "--delay": s.delay,
              "--dur": s.dur,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Centered POS popup. Entrance uses the 3D flip; close is a short fade. */
function PosFlipModal({
  open,
  onBackdrop,
  panelClassName,
  tone = "default",
  motion: motionStyle = "flip",
  children,
}: {
  open: boolean;
  onBackdrop?: () => void;
  panelClassName: string;
  tone?: "default" | "gold";
  motion?: "flip" | "soft";
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  const gold = tone === "gold";
  const flipIn = motionStyle !== "soft" && !reduce;
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pos-modal"
          className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 ${flipIn ? "[perspective:1600px]" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onBackdrop}
            className={`absolute inset-0 cursor-default backdrop-blur-[6px] ${gold ? "bg-[#3a2208]/55" : "bg-navy-950/55"}`}
          />
          {flipIn && <PosSparkField />}
          {gold && (
            <>
              <span aria-hidden="true" className="pos-gold-ring pointer-events-none absolute left-1/2 top-[18%] h-24 w-24 -translate-x-1/2 rounded-full border-2 border-gold-400/70" />
              <span aria-hidden="true" className="pos-gold-ring pointer-events-none absolute left-1/2 top-[18%] h-24 w-24 -translate-x-1/2 rounded-full border border-flame-400/50 [animation-delay:0.45s]" />
            </>
          )}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={flipIn ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: reduce ? 0.16 : 0.22, ease }}
            onClick={(e) => e.stopPropagation()}
            className={`relative z-10 max-h-[calc(100dvh-1.5rem)] ${flipIn ? "ssd-flip-in" : ""} ${panelClassName}`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent"
            />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SSD_CONFETTI = [
  { color: "#fff", tx: "-82px", ty: "-68px", r: "45deg", size: "9px", round: false },
  { color: "#fcd34d", tx: "75px", ty: "-78px", r: "-60deg", size: "7px", round: true },
  { color: "#ffe9a8", tx: "-95px", ty: "-28px", r: "120deg", size: "8px", round: false },
  { color: "#fff", tx: "88px", ty: "-42px", r: "-90deg", size: "6px", round: true },
  { color: "#d4af37", tx: "-65px", ty: "58px", r: "200deg", size: "10px", round: false },
  { color: "#fff", tx: "92px", ty: "50px", r: "-150deg", size: "7px", round: true },
  { color: "#fcd34d", tx: "-28px", ty: "85px", r: "80deg", size: "9px", round: false },
  { color: "#ffc98f", tx: "42px", ty: "90px", r: "-30deg", size: "8px", round: true },
];

function GoldLeaf({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3c4.2 2.2 7 6.2 7 11.2-3.8-.4-7-2.8-8.6-6.2C8.8 11.4 5.6 13.8 1.8 14.2 1.8 9.2 4.6 5.2 8.8 3L12 21"
        stroke="#ffe082"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AddedToCartPopup({
  notice,
  onClear,
}: {
  notice: { name: string; kind: "added" | "updated" } | null;
  onClear: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(onClear, 1400);
    return () => window.clearTimeout(t);
  }, [notice, onClear]);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={`${notice.kind}-${notice.name}`}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 [perspective:1200px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            className="absolute inset-0 bg-[#1a140c]/55 backdrop-blur-[14px]"
            onClick={onClear}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="status"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="ssd-flip-in relative z-10 w-full max-w-[22.5rem] overflow-hidden rounded-[26px] border border-[#ffd54a]/80 bg-[#fffdf8] shadow-[0_24px_60px_rgba(212,160,23,0.38)]"
          >
            <div className="relative px-6 pb-4 pt-7 text-center">
              <div className="pointer-events-none absolute left-1/2 top-11">
                {SSD_CONFETTI.slice(0, 8).map((c, i) => (
                  <span
                    key={i}
                    className="absolute"
                    style={
                      {
                        background: i % 2 === 0 ? "#d4af37" : "#f6e59b",
                        width: c.size,
                        height: c.size,
                        borderRadius: "50%",
                        animation: `ssd-sc-conf 1s ease-out ${0.22 + i * 0.03}s both`,
                        "--tx": c.tx,
                        "--ty": c.ty,
                        "--tr": c.r,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <div className="relative mx-auto mb-4 flex h-[4.75rem] w-[4.75rem] items-center justify-center">
                <span
                  className="absolute inset-[-8px] rounded-full border border-[#ffd54a]/70"
                  style={{ animation: "ssd-sc-ring 1.05s ease-out 0.2s both" }}
                />
                <span
                  className="ssd-cart-tick relative z-10 flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border border-[#ffe082]"
                  style={{
                    animation:
                      "ssd-sc-check-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.12s both, ssd-tick-glow 2.2s ease-in-out 0.6s infinite",
                  }}
                >
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                    <defs>
                      <linearGradient id="ssdCartGoldStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff8d0" />
                        <stop offset="40%" stopColor="#ffd54a" />
                        <stop offset="100%" stopColor="#e6b422" />
                      </linearGradient>
                    </defs>
                    <polyline
                      className="ssd-sc-chk"
                      points="20 6 9 17 4 12"
                      stroke="url(#ssdCartGoldStroke)"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
              <h3
                className="relative font-display text-[22px] font-bold leading-snug text-[#d4a017]"
                style={{ animation: "ssd-sc-title 0.45s ease 0.22s both" }}
              >
                {notice.kind === "updated" ? "Cart updated" : "Successfully added to cart"}
              </h3>
              <div className="relative mx-auto mt-3 mb-1 flex h-4 max-w-[13rem] items-center gap-2">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#ffd54a]" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffd54a" aria-hidden>
                  <path d="M12 2l1.8 5.4H19l-4.2 3.2 1.6 5.4L12 13.2 7.6 16l1.6-5.4L5 7.4h5.2L12 2z" />
                </svg>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#ffd54a]" />
              </div>
            </div>
            <div className="relative">
              <svg className="block w-full" viewBox="0 0 400 56" preserveAspectRatio="none" height="44" aria-hidden>
                <path d="M0,22 C80,4 130,40 200,18 C275,-2 330,32 400,12 L400,56 L0,56 Z" fill="#ffd54a" />
                <path d="M0,30 C95,10 155,48 230,26 C300,8 348,38 400,22 L400,56 L0,56 Z" fill="#e6b422" />
              </svg>
              <div className="flex items-center justify-center gap-3 bg-[#e6b422] px-5 pb-5 pt-1">
                <GoldLeaf />
                <p className="max-w-[14rem] truncate font-display text-[17px] font-semibold text-white">
                  {notice.name}
                </p>
                <GoldLeaf className="-scale-x-100" />
              </div>
              <div className="h-[3px] bg-gradient-to-r from-[#e6b422] via-[#fff3c4] to-[#e6b422]" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Each offering "type" gets its own accent throughout the catalogue grid —
// folder = crimson, item = flame orange, service = gold — so the three read
// as genuinely distinct families rather than the same orange tinted three ways.
type IconColor = "flame" | "crimson" | "gold" | "white" | "brown" | "darkPink" | "darkGreen";
const ICON_COLOR_CLASS: Record<IconColor, string> = {
  flame: "text-flame-600",
  crimson: "text-[#E11D2E]",
  gold: "text-[#F5A623]",
  white: "text-white",
  brown: "text-[#5D4037]",
  darkPink: "text-[#9D174D]",
  darkGreen: "text-[#166534]",
};

function FolderIcon({
  large,
  color = "crimson",
}: {
  large?: boolean;
  color?: IconColor;
}) {
  const size = large ? "h-8 w-8" : "h-4 w-4";
  return (
    <svg
      className={`${size} ${ICON_COLOR_CLASS[color]}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon({ color = "gold" }: { color?: IconColor } = {}) {
  return (
    <svg
      className={`h-8 w-8 ${ICON_COLOR_CLASS[color]}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BoxGlyph({ color = "crimson" }: { color?: IconColor } = {}) {
  return (
    <svg
      className={`h-8 w-8 ${ICON_COLOR_CLASS[color]}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One twinkling 4-point star — the "sparks" scattered across a catalogue
 *  card's banner. Reuses the existing twinkle keyframe (opacity only) with a
 *  per-instance delay/duration so a cluster of them never blinks in unison. */
function Spark({
  className = "",
  delay = 0,
  duration = 2.6,
}: {
  className?: string;
  delay?: number;
  duration?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`animate-twinkle text-white ${className}`}
      style={
        {
          animationDelay: `${delay}s`,
          "--dur": `${duration}s`,
        } as React.CSSProperties
      }
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
      style={{
        backgroundImage:
          "radial-gradient(circle, white 1.4px, transparent 1.4px)",
        backgroundSize: "9px 9px",
      }}
    />
  );
}

/**
 * Category / catalogue split — ornamental separator plate at a medium size.
 */
function SectionScreenDivider() {
  return (
    <div
      aria-hidden="true"
      role="separator"
      className="flex w-full shrink-0 justify-center px-6 py-1"
    >
      <img
        src="/pos_separationLine.webp"
        alt=""
        className="h-[3.25rem] w-full max-w-2xl select-none object-cover object-center sm:h-[3.75rem]"
      />
    </div>
  );
}

/** The little document glyph in a Folder card's "X offering(s)" row. */
function ListRowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M6 3.5h9l3 3V20a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z"
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 15.5h6" strokeLinecap="round" />
    </svg>
  );
}

/** The little price-tag glyph in an Item/Service card's price row. */
function PriceTagRowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M11.3 3.5H5a1.5 1.5 0 00-1.5 1.5v6.3c0 .4.16.78.44 1.06l8.6 8.6a1.5 1.5 0 002.12 0l6.3-6.3a1.5 1.5 0 000-2.12l-8.6-8.6a1.5 1.5 0 00-1.06-.44z"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect
        x="2.5"
        y="6"
        width="19"
        height="12"
        rx="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" />
      <path d="M5.5 9v0M18.5 15v0" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

/** QR-glyph stand-in for PayNow, matching CashIcon's stroke weight/shape language. */
function PaynowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="3" y="3" width="6.5" height="6.5" rx="1.2" />
      <rect x="14.5" y="3" width="6.5" height="6.5" rx="1.2" />
      <rect x="3" y="14.5" width="6.5" height="6.5" rx="1.2" />
      <path d="M14.5 14.5h3v3h-3zM20 14.5v3M17.5 20v1M14.5 20h1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Card + contactless-wave glyph for NETS, matching CashIcon/PaynowIcon's stroke weight/shape language. */
function NetsIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="2.5" y="5" width="15" height="14" rx="2" strokeLinejoin="round" />
      <path d="M2.5 9.5h15" strokeLinecap="round" />
      <path d="M19.5 8.5a5 5 0 0 1 0 7M22 6.5a8 8 0 0 1 0 11" strokeLinecap="round" />
    </svg>
  );
}

// Same terminal as NETS, so drawn as a plain card silhouette (no
// contactless arcs) to stay visually distinct from NetsIcon above.
function CreditCardIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" strokeLinejoin="round" />
      <path d="M2 9.5h20" strokeLinecap="round" />
      <path d="M5 15h5" strokeLinecap="round" />
    </svg>
  );
}

function ProceedPaymentModal({
  open,
  onClose,
  total,
  modes,
  modeId,
  onModeChange,
  amountInput,
  onAmountChange,
  amountValid,
  isPartial,
  balance,
  modeName,
  loading,
  onConfirm,
  onManualConfirm,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  modes: PaymentMode[];
  modeId: string;
  onModeChange: (id: string) => void;
  amountInput: string;
  onAmountChange: (v: string) => void;
  amountValid: boolean;
  isPartial: boolean;
  balance: number;
  modeName: string;
  loading: boolean;
  onConfirm: () => void;
  // Only meaningful for NETS/Credit Card (rendered as a second button next
  // to "Confirm ... Payment" for those modes only) — creates the exact same
  // pending terminal payment as the normal flow, but skips sending anything
  // to the terminal and opens NetsPaymentModal straight into its manual
  // transaction-ref-number form. See handleConfirmBooking's `manual` opt.
  onManualConfirm: () => void;
}) {
  const isTerminalMode = modeName.toLowerCase() === "nets" || modeName.toLowerCase() === "credit card";
  return (
    <PosFlipModal
      open={open}
      onBackdrop={onClose}
      panelClassName="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_30px_80px_-20px_rgba(179,39,63,0.4)]"
    >
      <div aria-hidden="true" className="h-1.5 shrink-0 bg-dark-orange" />
      <div className="flex items-center justify-between border-b border-gold-500/10 px-5 py-2.5">
        <div>
          <h2 className="font-accent text-[17px] font-extrabold tracking-tight text-ink-100">
            Collect Payment
          </h2>
          <p className="text-[12px] text-ink-500">Choose a method and amount to confirm this booking.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1.5 text-ink-500 hover:bg-ivory-100"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 px-5 py-3">
        <div className="flex items-center justify-between rounded-lg border border-[#f0b4a0]/60 bg-[#fffdfb] px-3 py-2 text-[13px] font-bold">
          <span className="flex items-center gap-1.5 text-ink-100">
            Total Payable
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
              GST Inclusive
            </span>
          </span>
          <span className="text-[#7c1527]">{formatCurrency(total)}</span>
        </div>

        <PaymentModeBoxes dense modes={modes} value={modeId} onChange={onModeChange} />

        <DivineInput
          staticLabel
          label="Payment Amount (S$)"
          type="number"
          min={0}
          max={total || undefined}
          step="0.01"
          inputMode="decimal"
          value={amountInput}
          onChange={(e) => onAmountChange(e.target.value)}
          error={
            amountInput !== "" && !amountValid
              ? `Enter an amount between $0.00 and ${formatCurrency(total)}.`
              : undefined
          }
        />
        <div
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-[11.5px] ${
            isPartial ? "bg-crimson-500/10 text-crimson-500" : "bg-emerald-500/10 text-emerald-700"
          }`}
        >
          <span>Balance Amount (after this payment)</span>
          <span className="font-semibold">{formatCurrency(balance)}</span>
        </div>
        {isPartial && (
          <p className="text-[10.5px] text-ink-500">
            Booking confirms now for the full order — collect the rest anytime from POS Transactions.
          </p>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 flex-col gap-2 border-t border-maroon/15 px-5 py-3 shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.18)]">
        {/* Primary CTA gets its own full-width row — cramming it in
            alongside Cancel/Manual Confirm truncated its label for longer
            mode names like "CREDIT CARD" and forced Manual Confirm to wrap. */}
        <FlameActionButton
          icon={<LockIcon />}
          chevron={false}
          onClick={onConfirm}
          disabled={!modeId || loading || !amountValid}
          className="w-full justify-center"
        >
          {loading
            ? "Confirming…"
            : isPartial
              ? `Confirm ${modeName} Payment (Partial)`
              : `Confirm ${modeName} Payment`}
        </FlameActionButton>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-gold-500/30 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-ink-300 transition-[border-color,color] duration-200 hover:border-flame-500/60 hover:text-flame-600"
          >
            Cancel
          </button>
          {isTerminalMode && (
            <button
              type="button"
              onClick={onManualConfirm}
              disabled={!modeId || loading || !amountValid}
              title="Enter the transaction reference number from the terminal's printed slip instead of waiting for its automatic confirmation."
              className="flex-1 rounded-md border border-[#7c1527]/40 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-[#7c1527] transition-colors duration-200 hover:bg-[#7c1527]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Manual Confirm
            </button>
          )}
        </div>
      </div>
    </PosFlipModal>
  );
}

/**
 * Shown once a PayNow order has been created and its QR generated (see
 * handleConfirmBooking's PayNow branch) — owns the "is it paid yet?" poll
 * for as long as it stays open. Unlike pollOrderStatus() (a fixed-attempt
 * blocking loop used for Cash/anything already resolved by the time the
 * request returns), PayNow settlement genuinely has no fixed timeline —
 * the customer has to find their phone and scan — so this polls
 * indefinitely on a 3-second cadence until the order is confirmed,
 * cancelled, expired, or the admin/cashier cancels out of this modal.
 *
 * Cancelling this modal does NOT cancel anything server-side — it just
 * stops watching. A still-pending order stays "pending", still holding its
 * inventory reservation, until it's either paid later or its own
 * 30-minute hold lapses on its own; a top-up's balance is simply left as
 * it was.
 *
 * `onPoll` is deliberately generic rather than this modal hardcoding one
 * endpoint — it's reused for two different questions that both reduce to
 * "has this PayNow payment landed yet": did a still-pending order get its
 * FIRST payment (checked via GET .../orders/:id/status), and did an
 * already-confirmed booking's balance actually drop after a top-up QR
 * (checked via GET .../bookings/:id, since that order is already
 * "confirmed" and its own /status endpoint has nothing new to say). Each
 * caller decides what "confirmed" means for its own case and what payload
 * to hand back through `onConfirmed`.
 */
function PaynowQrModal({
  open,
  referenceId,
  amount,
  qrImage,
  onPoll,
  onConfirmed,
  onCancel,
}: {
  open: boolean;
  referenceId: string;
  amount: number;
  qrImage: string;
  onPoll: () => Promise<{ status: "pending" | "confirmed" | "cancelled" | "expired"; data?: unknown }>;
  onConfirmed: (data: unknown) => void;
  onCancel: () => void;
}) {
  const [pollError, setPollError] = useState<string | null>(null);
  // React's own sanctioned way to reset state when a prop changes — done
  // here, during render, rather than in a useEffect, so a previous
  // session's error never has a chance to flash before this one's first
  // poll response arrives (see "You Might Not Need an Effect" in the React
  // docs for why this runs during render instead).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPollError(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timeoutId: number;

    async function tick() {
      // Only the poll call itself is wrapped — a transient network hiccup
      // there shouldn't abort a wait that could still resolve, so that
      // case alone is swallowed and retried. Everything after a successful
      // poll (in particular onConfirmed, which runs caller-supplied logic)
      // deliberately runs OUTSIDE this try/catch: an earlier version wrapped
      // the whole block, which meant a real bug in onConfirmed was silently
      // caught here and treated exactly like a network blip — retried
      // forever, with the modal stuck on "Waiting for payment" and nothing
      // in the console to explain why. Letting it throw for real means a
      // bug shows up as a bug, not as an infinite silent retry.
      let result;
      try {
        result = await onPoll();
      } catch {
        if (!cancelled) timeoutId = window.setTimeout(tick, PAYNOW_POLL_INTERVAL_MS);
        return;
      }
      if (cancelled) return;
      if (result.status === "confirmed") {
        onConfirmed(result.data);
        return;
      }
      if (result.status === "cancelled") {
        setPollError("This order was cancelled.");
        return;
      }
      if (result.status === "expired") {
        setPollError("The payment window expired — close this and start again.");
        return;
      }
      if (!cancelled) timeoutId = window.setTimeout(tick, PAYNOW_POLL_INTERVAL_MS);
    }

    timeoutId = window.setTimeout(tick, PAYNOW_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
    // onPoll/onConfirmed intentionally excluded — this effect should only
    // restart when the modal opens/closes, not on every parent re-render
    // (which would otherwise interrupt an in-flight wait for no reason).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <PosFlipModal
      open={open}
      onBackdrop={onCancel}
      tone="gold"
      panelClassName="flex w-full max-w-sm flex-col items-center overflow-hidden rounded-2xl border border-white/70 bg-white px-6 py-6 text-center shadow-[0_30px_80px_-20px_rgba(179,39,63,0.4)]"
    >
      <h2 className="font-accent text-[17px] font-extrabold tracking-tight text-ink-100">Scan to Pay with PayNow</h2>
      <p className="mt-1 text-[12px] text-ink-500">Reference {referenceId}</p>

      {qrImage ? (
        <img
          src={qrImage}
          alt="PayNow QR code"
          className="mt-4 h-56 w-56 rounded-xl border border-gold-500/30 bg-white p-2"
        />
      ) : (
        <div className="mt-4 flex h-56 w-56 items-center justify-center rounded-xl border border-gold-500/30 bg-ivory-50">
          <EmblemLoader size="sm" label="" />
        </div>
      )}

      <p className="mt-4 text-[22px] font-extrabold text-[#7c1527]">{formatCurrency(amount)}</p>

      {pollError ? (
        <p className="mt-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-[12px] text-crimson-500">
          {pollError}
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Waiting for payment — checks every 3 seconds…
        </p>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-5 rounded-md border border-gold-500/30 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-ink-300 transition-[border-color,color] duration-200 hover:border-flame-500/60 hover:text-flame-600"
      >
        Cancel
      </button>
    </PosFlipModal>
  );
}

const NETS_STATUS_POLL_INTERVAL_MS = 2000;
// The terminal itself has already approved by the time this phase starts —
// all that's left is one HTTP round trip from the EXE to SSD-Backend, which
// should resolve in well under a second normally. 30s is generous enough to
// absorb a slow network/cold start without making a genuinely broken
// confirmation (wrong URL, secret mismatch, backend down) look like it's
// still "just working on it" for an uncomfortably long time.
const NETS_CONFIRMING_TIMEOUT_MS = 30000;

/**
 * Shown once a NETS order's payment has been initiated (see
 * handleConfirmBooking's NETS branch) — sends the payment to the terminal
 * over the socket connection the moment it opens, then narrates the
 * PAYMENT_MESSAGE lifecycle live (INITIATED -> SUCCESS/FAILED/CANCELLED/
 * TERMINAL_ERROR/RETRY — see SSD Nets-Service's SOCKET_COMMANDS_REFERENCE.md).
 *
 * Unlike PaynowQrModal, there's nothing to scan and no indefinite wait —
 * the terminal (or, with the EXE's simulation mode on, its simulated
 * stand-in) always resolves the transaction itself. Once it reports
 * SUCCESS, this switches to the SAME polling contract PaynowQrModal uses
 * (`onPoll`/`onConfirmed`) to wait for SSD-Backend's own confirmation —
 * the terminal approving the card is not the same moment the booking gets
 * confirmed; that happens asynchronously, once the EXE calls SSD-Backend's
 * /payments/nets/callback.
 */
function NetsPaymentModal({
  open,
  kind = "NETS",
  referenceId,
  amount,
  onPoll,
  onConfirmed,
  onCancel,
  onManualConfirm,
  startInManualMode,
}: {
  open: boolean;
  // Same terminal, same PAYMENT_MESSAGE lifecycle either way — this only
  // picks which socket call to fire (see netsSocketService.ts's
  // processNetsPayment vs processCreditCardPayment) and the modal's own
  // title/label. Defaults to "NETS" so every existing call site (before
  // Credit Card support) keeps working unchanged.
  kind?: "NETS" | "CREDIT_CARD";
  referenceId: string;
  amount: number;
  onPoll: () => Promise<{ status: "pending" | "confirmed" | "cancelled" | "expired"; data?: unknown }>;
  onConfirmed: (data: unknown) => void;
  onCancel: () => void;
  // Fallback for when the terminal's own automatic callback hasn't landed
  // (or the cashier reads a genuine approval off the printed slip and
  // doesn't want to wait): POSTs the entered transaction reference number
  // straight to POST /pos/booking/manual-confirm, which runs through the
  // exact same dispatchPaymentConfirmation() the automatic path uses — see
  // that route's own comment. Rejecting the promise (e.g. a bad ref number,
  // an already-processed payment) surfaces as an inline error in the
  // manual-confirm form; resolving it hands control back to this modal's
  // own onPoll/onConfirmed flow below, exactly as a real terminal
  // confirmation would.
  onManualConfirm: (transactionRefNo: string) => Promise<void>;
  // Set when this instance was opened via Collect Payment's own "Manual
  // Confirm" button rather than "Confirm NETS/Credit Card Payment" — the
  // pending transaction still gets created exactly the same way, but this
  // modal never sends anything to the terminal (no socket call, no
  // PAYMENT_MESSAGE listener) and opens straight into the transaction-ref
  // form below instead of narrating an auto flow that was never started.
  startInManualMode?: boolean;
}) {
  const [phase, setPhase] = useState<"sending" | "initiated" | "verifying" | "confirming" | "failed">("sending");
  const [message, setMessage] = useState("Sending payment request to the terminal…");
  const [manualOpen, setManualOpen] = useState(!!startInManualMode);
  const [manualRef, setManualRef] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPhase("sending");
      setMessage("Sending payment request to the terminal…");
      setManualOpen(!!startInManualMode);
      setManualRef("");
      setManualError(null);
      setManualSubmitting(false);
    }
  }

  async function submitManualConfirm() {
    const trimmed = manualRef.trim();
    if (!trimmed) {
      setManualError("Enter the transaction reference number from the terminal's printed slip.");
      return;
    }
    setManualSubmitting(true);
    setManualError(null);
    try {
      await onManualConfirm(trimmed);
      // The backend has already flipped the payment to paid by the time
      // this resolves (confirmPosPayment runs synchronously) — one
      // immediate poll picks that up and routes into the same
      // onConfirmed(...) a real terminal callback would, via onPoll below.
      const result = await onPoll();
      if (result.status === "confirmed") {
        onConfirmed(result.data);
        return;
      }
      // Extremely unlikely (would mean the confirm succeeded but the
      // status read races behind it) — fall back to the normal poll loop
      // already running rather than leaving the form stuck.
      setManualOpen(false);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Could not confirm this payment. Check the reference number and try again.");
    } finally {
      setManualSubmitting(false);
    }
  }

  useEffect(() => {
    // A manual-only instance never talks to the terminal at all — nothing
    // was sent, so there's nothing to listen for or narrate. The manual
    // form's own submitManualConfirm() above is this instance's entire flow.
    if (!open || startInManualMode) return;
    let cancelled = false; // effect torn down (modal closed/unmounted)
    let stopped = false; // a terminal outcome (confirmed/failed) was already reached — stop polling either way
    let pollTimeoutId: number;
    let confirmingTimeoutId: number;

    function pollUntilConfirmed() {
      // Defense-in-depth: the EXE now broadcasts an explicit FAILED
      // PAYMENT_MESSAGE if it can't reach/gets rejected by SSD-Backend (see
      // index.js's confirmAndPrintNetsPayment), which is what normally ends
      // this poll early. But if the EXE process itself dies or can't
      // broadcast at all, this cap is what stops the spinner from running
      // forever with no explanation — the terminal genuinely did approve
      // the card by this point, so this is reported as a confirmation
      // problem, not a declined payment.
      confirmingTimeoutId = window.setTimeout(() => {
        if (cancelled || stopped) return;
        stopped = true;
        setPhase("failed");
        setMessage(
          "Terminal approved, but SSD-Backend hasn't confirmed the booking after 30 seconds. Check the Nets-Service EXE's log file and SSD-Backend's own console for a request to /payments/nets/callback."
        );
      }, NETS_CONFIRMING_TIMEOUT_MS);

      async function tick() {
        let result;
        try {
          result = await onPoll();
        } catch {
          if (!cancelled && !stopped) pollTimeoutId = window.setTimeout(tick, NETS_STATUS_POLL_INTERVAL_MS);
          return;
        }
        if (cancelled || stopped) return;
        if (result.status === "confirmed") {
          stopped = true;
          window.clearTimeout(confirmingTimeoutId);
          onConfirmed(result.data);
          return;
        }
        if (result.status === "cancelled" || result.status === "expired") {
          stopped = true;
          window.clearTimeout(confirmingTimeoutId);
          setPhase("failed");
          setMessage("The order could not be confirmed — it was cancelled or its hold expired. Close this and try again.");
          return;
        }
        if (!cancelled && !stopped) pollTimeoutId = window.setTimeout(tick, NETS_STATUS_POLL_INTERVAL_MS);
      }
      tick();
    }

    const offPaymentMessage = netsSocketService.on("PAYMENT_MESSAGE", (data) => {
      if (cancelled || stopped) return;
      const payload = data as { status?: string; message?: string; response?: { translated?: { responsetext?: string } } };
      const normalized = normalizeRealtimeStatus(payload as Record<string, unknown>);

      if (normalized === "online") {
        // "online" here means the SDK's own SUCCESS/COMPLETED status — see
        // normalizeRealtimeStatus, which is shared with terminal-connectivity
        // reporting since the SDK reuses the same status vocabulary.
        setPhase("confirming");
        setMessage("Terminal approved — confirming with SSD-Backend…");
        pollUntilConfirmed();
        return;
      }
      if (payload.status === "INITIATED") {
        setPhase("initiated");
        setMessage(payload.message || "Payment initiated — follow the prompts on the terminal.");
        return;
      }
      // The EXE's own nets-service-sdk didn't hear back from the terminal
      // in time (no ACK, a NACK loop, or no result frame — see the SSD
      // patch in patches/nets-service-sdk+1.1.21.patch) and is re-querying
      // it directly (Function 56 "Recovery") for the real outcome before
      // giving up — the terminal may already have completed the charge
      // even though the app-level exchange got out of sync. NOT a failure
      // yet: stay in a waiting state and keep listening for the recovery
      // query's own follow-up PAYMENT_MESSAGE (a genuine SUCCESS routes
      // through the "online" branch above; a genuine failure still reaches
      // the catch-all below).
      if (payload.status === "UNKNOWN" && (payload as { action?: string }).action === "VERIFYING_STATUS") {
        setPhase("verifying");
        setMessage(payload.message || "Terminal didn't confirm in time — verifying the real outcome directly with it. Please wait…");
        return;
      }
      // CANCELLED / TERMINAL_ERROR / RETRY / BACKEND_CONFIRMATION_FAILED / a
      // SUCCESS that failed the genuine-approval check (see the EXE's
      // paymentOutcomes.js) — all land here as a stopped, explainable
      // failure rather than a silent hang. Also stops any poll already in
      // flight from the "confirming" phase above.
      stopped = true;
      window.clearTimeout(confirmingTimeoutId);
      setPhase("failed");
      setMessage(payload.message || payload.response?.translated?.responsetext || `Payment ${payload.status?.toLowerCase() || "failed"}.`);
    });

    const sendPayment = kind === "CREDIT_CARD" ? netsSocketService.processCreditCardPayment.bind(netsSocketService) : netsSocketService.processNetsPayment.bind(netsSocketService);
    sendPayment({ orderId: referenceId, amount }, (ack) => {
      if (cancelled || stopped) return;
      if (ack.status !== "success") {
        stopped = true;
        setPhase("failed");
        setMessage(typeof ack.error === "string" ? ack.error : ack.error?.message || ack.message || `Could not reach the ${kind === "CREDIT_CARD" ? "credit card" : "NETS"} terminal.`);
      }
    });

    return () => {
      cancelled = true;
      offPaymentMessage();
      window.clearTimeout(pollTimeoutId);
      window.clearTimeout(confirmingTimeoutId);
    };
    // referenceId/amount/onPoll/onConfirmed/kind intentionally excluded —
    // this effect should only restart when the modal opens/closes, matching
    // PaynowQrModal's own convention.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startInManualMode]);

  const isFailed = phase === "failed";

  return (
    <PosFlipModal
      open={open}
      onBackdrop={isFailed ? onCancel : undefined}
      tone="gold"
      panelClassName="flex w-full max-w-sm flex-col items-center overflow-hidden rounded-2xl border border-white/70 bg-white px-6 py-6 text-center shadow-[0_30px_80px_-20px_rgba(179,39,63,0.4)]"
    >
      <h2 className="font-accent text-[17px] font-extrabold tracking-tight text-ink-100">
        Pay with {kind === "CREDIT_CARD" ? "Credit Card" : "NETS"}
      </h2>
      <p className="mt-1 text-[12px] text-ink-500">Reference {referenceId}</p>

      {manualOpen ? (
        <div className="mt-4 w-full text-left">
          <div className="rounded-lg border border-gold-500/30 bg-ivory-50 px-3 py-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink-500">Order Reference</span>
              <span className="font-semibold text-ink-100">{referenceId}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[12px]">
              <span className="text-ink-500">Amount</span>
              <span className="font-semibold text-[#7c1527]">{formatCurrency(amount)}</span>
            </div>
          </div>

          <label className="mt-3 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
            Transaction Reference No.
          </label>
          <p className="mt-0.5 text-[11px] text-ink-400">
            From the {kind === "CREDIT_CARD" ? "credit card" : "NETS"} terminal&apos;s printed slip.
          </p>
          <input
            type="text"
            autoFocus
            value={manualRef}
            onChange={(e) => {
              setManualRef(e.target.value);
              if (manualError) setManualError(null);
            }}
            disabled={manualSubmitting}
            placeholder="e.g. 123456789012"
            className="mt-1.5 w-full rounded-md border border-gold-500/30 bg-white px-3 py-2 text-[13px] text-ink-100 outline-none focus:border-flame-500/60 disabled:opacity-60"
          />
          {manualError && (
            <p className="mt-1.5 rounded-md border border-crimson-500/30 bg-crimson-500/10 px-2.5 py-1.5 text-[11.5px] text-crimson-500">
              {manualError}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (startInManualMode) {
                  onCancel();
                  return;
                }
                setManualOpen(false);
                setManualError(null);
              }}
              disabled={manualSubmitting}
              className="flex-1 rounded-md border border-gold-500/30 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-ink-300 hover:border-flame-500/60 hover:text-flame-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {startInManualMode ? "Cancel" : "Back"}
            </button>
            <button
              type="button"
              onClick={submitManualConfirm}
              disabled={manualSubmitting || !manualRef.trim()}
              className="flex-1 rounded-md bg-[#7c1527] px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#63101f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {manualSubmitting ? "Confirming…" : "Confirm Payment"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-32 w-32 items-center justify-center rounded-full border-4 border-gold-500/30 bg-ivory-50">
            {isFailed ? (
              <span className="text-[40px] text-crimson-500">✕</span>
            ) : phase === "confirming" || phase === "verifying" ? (
              <EmblemLoader size="sm" label="" />
            ) : (
              <span className="animate-pulse text-[40px] text-[#7c1527]">💳</span>
            )}
          </div>

          <p className="mt-4 text-[22px] font-extrabold text-[#7c1527]">{formatCurrency(amount)}</p>

          {isFailed ? (
            <p className="mt-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-[12px] text-crimson-500">{message}</p>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={onCancel}
            disabled={!isFailed && phase !== "sending" && phase !== "initiated"}
            className="mt-5 rounded-md border border-gold-500/30 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-ink-300 transition-[border-color,color] duration-200 hover:border-flame-500/60 hover:text-flame-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isFailed ? "Close" : "Cancel"}
          </button>

          {!isFailed && (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="mt-2 text-[11.5px] font-semibold text-ink-400 underline decoration-dotted underline-offset-2 transition hover:text-flame-600"
            >
              Enter transaction ref manually
            </button>
          )}
        </>
      )}
    </PosFlipModal>
  );
}

function PaymentModeBoxes({
  modes,
  value,
  onChange,
  dense = false,
}: {
  modes: PaymentMode[];
  value: string;
  onChange: (id: string) => void;
  dense?: boolean;
}) {
  return (
    <div className={`${dense ? "space-y-1" : "space-y-1.5"} text-left`}>
      <p className={`flex items-center gap-1.5 ${FORM_LABEL} ${dense ? "!mb-1" : ""}`}>
        <CashIcon className="h-3.5 w-3.5" /> Payment Method
      </p>
      <div className={dense ? "flex flex-wrap gap-1.5" : "grid grid-cols-2 gap-1.5"}>
        {modes.map((m) => {
          const modeKey = m.name.toLowerCase();
          const isEnabled = modeKey === "cash" || modeKey === "paynow" || modeKey === "nets" || modeKey === "credit card";
          const ModeIcon =
            modeKey === "paynow" ? PaynowIcon : modeKey === "nets" ? NetsIcon : modeKey === "credit card" ? CreditCardIcon : CashIcon;
          const selected = isEnabled && value === m._id;
          const tileShape = dense
            ? "flex flex-row items-center gap-1.5 rounded-md px-2.5 py-1.5"
            : "flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-center";
          if (!isEnabled) {
            return (
              <button
                key={m._id}
                type="button"
                disabled
                aria-disabled="true"
                title={`${m.name} isn't available yet`}
                className={`${tileShape} cursor-not-allowed border-2 border-dashed border-gold-500/20 bg-ivory-50/60 opacity-45`}
              >
                <span className="text-[11.5px] font-semibold text-ink-300">{m.name}</span>
                <span className="text-[9px] font-medium text-ink-500">Coming soon</span>
              </button>
            );
          }
          return (
            <motion.button
              key={m._id}
              type="button"
              onClick={() => onChange(m._id)}
              whileHover={{ y: dense ? -1 : -3, scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className={`group relative overflow-hidden border-2 ${tileShape} ${
                selected
                  ? "pos-pay-tile-on border-emerald-600 bg-emerald-600"
                  : "border-gold-500/25 bg-white shadow-[0_2px_8px_-6px_rgba(0,0,0,0.2)] hover:border-flame-400/60"
              }`}
            >
              {selected && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                  <span className="pos-pay-shine" />
                </span>
              )}
              <motion.span
                animate={selected ? { rotate: [0, -8, 8, 0], scale: [1, 1.12, 1] } : { rotate: 0, scale: 1 }}
                transition={{ duration: 0.45 }}
              >
                <ModeIcon className={`h-4 w-4 ${selected ? "text-white" : "text-emerald-600"}`} />
              </motion.span>
              <span className={`relative text-[11.5px] font-semibold ${selected ? "text-white" : "text-ink-100"}`}>
                {m.name}
              </span>
              <AnimatePresence initial={false}>
                {selected && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 18 }}
                    className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/25"
                  >
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

type CatalogueCardTheme = {
  banner: string;
  border: string;
  rowBg: string;
  rowText: string;
  bodyBg: string;
  iconColor: IconColor;
};

const CATALOGUE_CARD_THEME: Record<
  "folder" | "item" | "service",
  CatalogueCardTheme
> = {
  folder: {
    banner: "bg-[#E85D04]",
    border: "border-[#E85D04]",
    rowBg: "bg-[#fed7aa]",
    rowText: "text-[#c2410c]",
    bodyBg: "bg-[#fff7ed]",
    iconColor: "flame",
  },
  item: {
    banner: "bg-[#9D174D]",
    border: "border-[#9D174D]",
    rowBg: "bg-[#fbcfe8]",
    rowText: "text-[#9D174D]",
    bodyBg: "bg-[#fdf2f8]",
    iconColor: "darkPink",
  },
  service: {
    banner: "bg-[#166534]",
    border: "border-[#166534]",
    rowBg: "bg-[#bbf7d0]",
    rowText: "text-[#166534]",
    bodyBg: "bg-[#f0fdf4]",
    iconColor: "darkGreen",
  },
};

/**
 * One shared card shell for Folder / Item / Service in the catalogue grid —
 * a solid-color banner (icon + light texture) over a white body (title and
 * a secondary row for the folder's offering count or the item/service's
 * price). Folder, Item, and Service differ only by `theme`, `icon`, and the
 * row content.
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
  imageUrl,
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
  imageUrl?: string | null;
}) {
  const cover = resolveImageUrl(imageUrl);
  const bigIcon =
    iconKind === "folder" ? (
      <FolderIcon large color={theme.iconColor} />
    ) : iconKind === "service" ? (
      <SparkleIcon color={theme.iconColor} />
    ) : (
      <BoxGlyph color={theme.iconColor} />
    );

  const footer = (
    <div
      className={`flex w-full min-w-0 items-center justify-between gap-1 rounded-full px-2 py-1 ${theme.rowBg}`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_-2px_rgba(0,0,0,0.2)]">
          {rowIcon}
        </span>
        <span className={`truncate whitespace-nowrap text-[11px] font-semibold ${theme.rowText}`}>
          {rowLabel}
        </span>
      </span>
      <ChevronIcon className={`-rotate-90 shrink-0 ${theme.rowText}`} />
    </div>
  );

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -4, scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={`group relative rounded-2xl border-2 ${theme.border} ${theme.bodyBg} text-left shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)] transition-shadow duration-200 hover:shadow-[0_16px_32px_-12px_rgba(0,0,0,0.5)] disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <div className={`flex h-full flex-col overflow-hidden rounded-[14px] ${theme.bodyBg}`}>
        <div className={`relative overflow-hidden ${theme.banner} ${cover ? "h-28 sm:h-32 md:h-[9.5rem]" : "h-14"}`}>
          {cover ? (
            <>
              <img
                src={cover}
                alt=""
                className="absolute inset-0 h-full w-full object-contain object-center drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-10 text-center">
                <p className="line-clamp-2 text-[13.5px] font-bold leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.9),0_0_18px_rgba(0,0,0,0.55)]">
                  {title}
                </p>
                {tamilName && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-white/95 [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
                    {tamilName}
                  </p>
                )}
                {extraBadges && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
                    {extraBadges}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <DotGrid className="bottom-1 left-1.5 h-7 w-7" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/25 ring-[3px] ring-white/50">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_-6px_rgba(0,0,0,0.3)]">
                    {bigIcon}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col items-start gap-1 px-2.5 py-2">
          {!cover && (
            <>
              <div className="min-w-0 w-full">
                <p className="truncate text-[13.5px] font-bold leading-tight text-ink-100">
                  {title}
                </p>
                {tamilName && (
                  <p className="truncate text-[10.5px] text-ink-500">{tamilName}</p>
                )}
              </div>
              {extraBadges && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {extraBadges}
                </div>
              )}
            </>
          )}
          {footer}
        </div>
      </div>
    </motion.button>
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
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((i) => (
        <OfferingCard
          key={i._id}
          offering={{ refType: "Item", ...i }}
          onPick={onPick}
        />
      ))}
      {services.map((s) => (
        <OfferingCard
          key={s._id}
          offering={{ refType: "Service", salePrice: s.defaultSalePrice, ...s }}
          onPick={onPick}
        />
      ))}
      {items.length === 0 && services.length === 0 && (
        <p className="col-span-full py-8 text-center text-[13px] text-ink-500">
          Nothing here yet.
        </p>
      )}
    </div>
  );
}

function OfferingCard({
  offering,
  onPick,
}: {
  offering: Offering;
  onPick: (o: Offering) => void;
}) {
  const outOfStock =
    offering.inventory.isApplicable &&
    (offering.inventory.availableQty ?? 0) <= 0;
  const lowStock =
    !outOfStock &&
    offering.inventory.isApplicable &&
    (offering.inventory.availableQty ?? 0) <=
      (offering.inventory.threshold ?? 0) + 1;

  // Item and Service each get their own accent family (rose vs. gold)
  // instead of sharing one look, matching Folder's orange — three offering
  // "types" throughout the catalogue now read as visibly distinct.
  const isService = offering.refType === "Service";
  const theme = isService
    ? CATALOGUE_CARD_THEME.service
    : CATALOGUE_CARD_THEME.item;

  return (
    <CatalogueCard
      onClick={() => onPick(offering)}
      disabled={outOfStock}
      iconKind={isService ? "service" : "item"}
      title={offering.name}
      tamilName={offering.tamilName}
      theme={theme}
      imageUrl={offering.image}
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

function CartLineRow({
  line,
  onEdit,
  onRemove,
}: {
  line: CartLine;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`relative z-10 rounded-lg border p-3 shadow-[0_2px_4px_rgba(124,21,39,0.12),0_8px_18px_rgba(0,0,0,0.14)] transition-shadow duration-200 ${line.quantityExceedsStock ? "border-crimson-500/40 bg-crimson-500/5" : "border-[#d4b8a4] bg-white hover:shadow-[0_4px_8px_rgba(124,21,39,0.16),0_12px_24px_rgba(0,0,0,0.16)]"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink-100">
            {line.name}
          </p>
          <p className="text-[11.5px] text-ink-500">
            {line.refType} · Qty {line.quantity}
            {line.devotees.length > 0 &&
              ` · ${line.devotees.map((d) => d.name).join(", ")}`}
          </p>
          {line.quantityExceedsStock && (
            <p className="text-[11px] text-crimson-500">
              Only {line.inventory?.availableQty ?? 0} available
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-[13px] font-semibold text-[#7c1527]">
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
  open,
  offering: offeringProp,
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
  open: boolean;
  offering: Offering | null;
  deityOptions: DeityOption[];
  nakshatraOptions: ListboxOption[];
  deities: string[];
  onDeitiesChange: (v: string[]) => void;
  devotees: Devotee[];
  onDevoteesChange: (v: Devotee[]) => void;
  devoteeRows: number;
  onAddDevotee: () => void;
  onRemoveDevotee: (idx: number) => void;
  devoteeNameSuggestions?: Devotee[];
  quantity: number;
  onQuantityChange: (v: number) => void;
  total: number;
  isEditing?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const held = useRef(offeringProp);
  if (offeringProp) held.current = offeringProp;
  const offering = held.current;

  // Stays false until a blocked submit — the "Nakshatra required" state
  // only lights up rows once someone has actually tried to proceed with
  // one missing, not while they're still filling the form in.
  const [showValidation, setShowValidation] = useState(false);

  function toggleDeity(id: string) {
    onDeitiesChange(
      deities.includes(id) ? deities.filter((d) => d !== id) : [...deities, id],
    );
  }

  // Fills ONE specific devotee row (the one its suggestion chips are
  // rendered under) with a suggested devotee — name AND nakshatra together,
  // so a repeat visitor doesn't have to re-pick the nakshatra either.
  function fillDevoteeRow(idx: number, suggestion: Devotee) {
    const updated = [...devotees];
    updated[idx] = { name: suggestion.name, nakshatra: suggestion.nakshatra };
    onDevoteesChange(updated);
  }

  const usedDevoteeNames = new Set(
    devotees.map((d) => d.name.trim().toLowerCase()).filter(Boolean),
  );
  // Suggestions for one row: hidden once that row already has a name typed
  // in (nothing left to suggest into it), and never offering a devotee
  // already added to a DIFFERENT row in this same form.
  function suggestionsForRow(rowDevotee: Devotee) {
    if (rowDevotee.name.trim()) return [];
    return (devoteeNameSuggestions ?? []).filter((s) => !usedDevoteeNames.has(s.name.toLowerCase()));
  }

  function handleConfirm() {
    if (!offering) return;
    if (
      offering.isFamilyMembersRequired &&
      devotees.some((d) => d.name.trim() && !d.nakshatra)
    ) {
      setShowValidation(true);
      toast.error("Please select a Nakshatra for each devotee name entered.");
      return;
    }
    onConfirm();
  }

  return (
    <PosFlipModal
      open={open}
      onBackdrop={onCancel}
      panelClassName="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_30px_80px_-20px_rgba(179,39,63,0.4)]"
    >
          {offering && (
          <>
          <div
            aria-hidden="true"
            className="h-1.5 shrink-0 bg-dark-orange"
          />
          <div className="flex items-center justify-between border-b border-gold-500/10 px-5 py-2">
            <div className="min-w-0">
              {isEditing && (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                  Editing cart line
                </p>
              )}
              <h2 className="truncate font-accent text-[17px] font-extrabold tracking-tight text-ink-100">
                {offering.name}
              </h2>
              {offering.tamilName && (
                <p className="truncate text-[12px] text-ink-500">{offering.tamilName}</p>
              )}
            </div>
            <button
              onClick={onCancel}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-500 hover:bg-ivory-100"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
            {offering.isDeityMappingRequired && deityOptions.length > 0 && (
              <div>
                <p className={`${FORM_LABEL} mb-2`}>
                  Deities (Multi-Select) *
                </p>
                <div className="flex flex-wrap gap-2">
                  {deityOptions.map((d) => {
                    const selected = deities.includes(d._id);
                    return (
                      <button
                        key={d._id}
                        type="button"
                        onClick={() => toggleDeity(d._id)}
                        className={`flex items-center gap-1.5 rounded-md border px-3.5 py-1.5 text-[13px] font-medium transition-[transform,box-shadow,background-color,color,border-color] duration-200 hover:-translate-y-0.5 ${
                          selected ? POS_BTN_ON : POS_BTN_OFF
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
                              <svg
                                className="h-3 w-3 shrink-0"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path
                                  d="M5 13l4 4L19 7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
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
                  {deities.length} deity/deities selected · Qty:{" "}
                  {deities.length || 0}
                </p>
              </div>
            )}

            {!(offering.isDeityMappingRequired && deityOptions.length > 0) && (
              <div>
                <p className={`${FORM_LABEL} mb-2`}>Quantity</p>
                <div className="inline-flex items-center gap-3 rounded-xl border border-gold-500/30 bg-white px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-flame-600 transition-colors hover:bg-flame-500/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <MinusIcon />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => onQuantityChange(Math.max(1, Number(e.target.value) || 1))}
                    className="w-12 bg-transparent text-center font-body text-[16px] font-semibold text-ink-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => onQuantityChange(quantity + 1)}
                    aria-label="Increase quantity"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-flame-600 transition-colors hover:bg-flame-500/10"
                  >
                    <PlusIcon />
                  </button>
                </div>
              </div>
            )}

            {offering.isFamilyMembersRequired && devoteeRows > 0 && (
              <div className="space-y-3">
                <p className={FORM_LABEL}>
                  Devotee Details (max {offering.maxFamilyMembers}) *
                </p>
                {devotees.map((devotee, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(9.5rem,11rem)_auto] items-start gap-2"
                  >
                    <div>
                      <DivineInput
                        staticLabel
                        label={`Devotee ${idx + 1}`}
                        placeholder="Enter name"
                        value={devotee.name}
                        onChange={(e) => {
                          const updated = [...devotees];
                          updated[idx] = {
                            ...updated[idx],
                            name: e.target.value,
                          };
                          onDevoteesChange(updated);
                        }}
                        autoComplete="off"
                      />
                      {suggestionsForRow(devotee).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {suggestionsForRow(devotee).map((s) => (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => fillDevoteeRow(idx, s)}
                              className="rounded-full border border-gold-500/30 bg-white px-2.5 py-0.5 text-[11.5px] font-medium text-amber-700 transition-colors hover:border-gold-400/60 hover:bg-gold-500/5"
                            >
                              + {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <DivineListbox
                      label="Nakshatra"
                      value={devotee.nakshatra}
                      onChange={(v) => {
                        const updated = [...devotees];
                        updated[idx] = { ...updated[idx], nakshatra: v };
                        onDevoteesChange(updated);
                      }}
                      options={nakshatraOptions}
                      placeholder="Select…"
                      error={
                        showValidation &&
                        devotee.name.trim() &&
                        !devotee.nakshatra
                          ? "Required"
                          : undefined
                      }
                    />
                    {devotees.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveDevotee(idx)}
                        aria-label="Remove family member"
                        className="mt-[22px] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-700/20 bg-red-600 text-white shadow-[0_2px_5px_-1px_rgba(220,38,38,0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-3px_rgba(220,38,38,0.6)] active:translate-y-0"
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

          <div className="relative z-10 flex shrink-0 items-center justify-between border-t border-maroon/15 px-5 py-3 shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.18)]">
            <p className="text-[14px]">
              <span className="text-ink-500">Total: </span>
              <span className="font-bold text-[#7c1527]">
                {formatCurrency(total)}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-gold-500/30 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-ink-300 transition-[border-color,color] duration-200 hover:border-flame-500/60 hover:text-flame-600"
              >
                Cancel
              </button>
              <FlameActionButton
                icon={<PlusIcon />}
                chevron={false}
                onClick={handleConfirm}
                disabled={
                  offering.isDeityMappingRequired && deityOptions.length > 0 && deities.length === 0
                }
              >
                {isEditing ? "Save Changes" : "Add to Cart"}
              </FlameActionButton>
            </div>
          </div>
          </>
          )}
    </PosFlipModal>
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
function CreateCustomerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
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
        const r = await api.get<ApiEnvelope<WalkInMatch | null>>(
          "/pos/booking/customers/lookup",
          { params: { mobileNumber: mobile } },
        );
        const found = unwrap(r);
        setMatched(found);
        if (found) {
          setName(found.name);
          setEmail(found.email);
          setDateOfBirth(
            found.dateOfBirth ? found.dateOfBirth.slice(0, 10) : "",
          );
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
    if (mobileNumber && !isValidSgMobile(mobileNumber)) {
      setError(SG_MOBILE_ERROR);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.post<ApiEnvelope<Customer>>(
        "/pos/booking/customers",
        {
          name: name.trim(),
          email: email.trim(),
          mobileNumber: mobileNumber.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          gender: gender || undefined,
        },
      );
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
    <PosFlipModal
      open={open}
      onBackdrop={onClose}
      panelClassName="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gold-500/25 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
    >
          <div className="shrink-0 border-b border-gold-500/10 px-5 py-3">
            <h2 className="font-display text-[18px] font-bold text-ink-100">
              Create Customer
            </h2>
            <p className="text-[12.5px] text-ink-500">
              Quick walk-in profile — no login required.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {matched && (
              <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-gold-500/25 bg-gold-500/5 px-3.5 py-2.5">
                <p className="text-[12.5px] text-amber-700">
                  Existing profile found for this mobile number (
                  {matched.customerCode}) — details filled in below.
                </p>
                <button
                  type="button"
                  onClick={clearMatch}
                  className="whitespace-nowrap text-[12px] text-crimson-500 hover:underline"
                >
                  Not this person?
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DivineInput
                staticLabel
                label="Full Name"
                icon={<UserIcon />}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!matched}
              />
              <DivineInput
                staticLabel
                label="Email"
                icon={<MailIcon />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!matched}
              />
              <DivineInput
                staticLabel
                label="Mobile Number"
                icon={<span className="text-[13.5px] font-semibold text-ink-500">+65</span>}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(sanitizeMobileInput(e.target.value))}
                hint={checkingMobile ? "Checking…" : undefined}
              />
              <DivineDatePicker
                staticLabel
                label="Date of birth"
                value={dateOfBirth}
                onChange={setDateOfBirth}
                placeholder="Not recorded"
              />
              <DivineListbox
                label="Gender"
                value={gender}
                onChange={setGender}
                options={CREATE_CUSTOMER_GENDER_OPTIONS}
                disabled={!!matched}
              />
            </div>
            {error && (
              <p className="mt-3 text-[12.5px] text-crimson-500">{error}</p>
            )}
          </div>
          <div className="relative z-10 flex shrink-0 justify-end gap-3 border-t border-maroon/15 px-5 py-3 shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.18)]">
            <DivineButton
              variant="ghost"
              fullWidth={false}
              type="button"
              onClick={onClose}
            >
              Cancel
            </DivineButton>
            <DivineButton
              variant="flame"
              fullWidth={false}
              type="button"
              loading={submitting}
              onClick={submit}
            >
              {matched ? "Use This Customer" : "Create"}
            </DivineButton>
          </div>
    </PosFlipModal>
  );
}

/**
 * Shows a past booking's line items in a center-screen popup — "repeat this
 * booking" for the counter. Add to Cart re-checks live availability before
 * doing anything (see addRecentBookingToCart); this component only renders
 * what was originally bought and triggers that check.
 */
function RecentBookingModal({
  open,
  booking: bookingProp,
  loading,
  onClose,
  onAddToCart,
}: {
  open: boolean;
  booking: RecentBooking | null;
  loading: boolean;
  onClose: () => void;
  onAddToCart: () => void;
}) {
  const held = useRef(bookingProp);
  if (bookingProp) held.current = bookingProp;
  const booking = held.current;
  return (
    <PosFlipModal
      open={open}
      onBackdrop={onClose}
      panelClassName="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_30px_80px_-20px_rgba(179,39,63,0.4)]"
    >
          {booking && (
          <>
          <div className="flex items-start justify-between border-b border-gold-500/10 px-5 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-500">
                Order No.
              </p>
              <h2 className="text-[15px] font-bold tabular-nums text-ink-100">
                {booking.orderNumber ?? booking.bookingNumber}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-500">
                {formatTempleDateTime(booking.bookedAt)}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-500 hover:bg-ivory-100"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
            {booking.lines.map((line, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-medium text-ink-100">
                      {line.name}
                    </p>
                    <p className="text-[11.5px] text-ink-500">
                      {line.refType} · {line.code} · Qty {line.quantity}
                    </p>
                    {line.deities.length > 0 && (
                      <p className="mt-1 text-[11.5px] text-ink-500">
                        Deities: {line.deities.map((d) => d.name).join(", ")}
                      </p>
                    )}
                    {line.devotees.length > 0 && (
                      <p className="text-[11.5px] text-ink-500">
                        Devotees: {line.devotees.map((d) => d.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="whitespace-nowrap font-semibold text-amber-600">
                    {formatCurrency(line.lineTotal)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-gold-500/10 px-5 py-3">
            <p className="text-[14px]">
              <span className="text-ink-500">Total: </span>
              <span className="font-bold text-amber-600">
                {formatCurrency(booking.grandTotal)}
              </span>
            </p>
            <div className="flex gap-3">
              <DivineButton
                variant="ghost"
                fullWidth={false}
                type="button"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </DivineButton>
              <DivineButton
                variant="flame"
                fullWidth={false}
                type="button"
                loading={loading}
                onClick={onAddToCart}
              >
                Add to Cart
              </DivineButton>
            </div>
          </div>
          </>
          )}
    </PosFlipModal>
  );
}

/**
 * Shown when re-adding a past booking finds some lines no longer valid
 * (deactivated, out of stock, ...) — lists exactly what's unavailable and
 * why, and lets staff proceed with just the still-available lines instead
 * of failing the whole re-order.
 */
function UnavailableLinesDialog({
  open,
  unavailableLines: linesProp,
  availableCount,
  onCancel,
  onProceed,
}: {
  open: boolean;
  unavailableLines: RecheckedLine[] | null;
  availableCount: number;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const held = useRef(linesProp);
  if (linesProp) held.current = linesProp;
  const unavailableLines = held.current ?? [];
  return (
    <PosFlipModal
      open={open}
      onBackdrop={onCancel}
      panelClassName="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gold-500/25 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
    >
          <div className="shrink-0 border-b border-gold-500/10 px-5 py-3">
            <h2 className="font-display text-[18px] font-bold text-ink-100">
              Some items aren&apos;t available
            </h2>
            <p className="text-[12.5px] text-ink-500">
              {availableCount > 0
                ? `${availableCount} item(s) from this booking are still available. The rest can't be re-added right now:`
                : "None of this booking's items can be re-added right now:"}
            </p>
          </div>
          <div className="max-h-[min(28vh,12rem)] space-y-2 overflow-y-auto px-5 py-3">
            {unavailableLines.map((line, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-crimson-500/25 bg-crimson-500/5 px-3 py-2.5"
              >
                <p className="text-[13px] font-medium text-ink-100">
                  {line.name ?? "Unknown item"}
                </p>
                <p className="text-[11.5px] text-crimson-500">{line.reason}</p>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-gold-500/10 px-5 py-3">
            <DivineButton
              variant="ghost"
              fullWidth={false}
              type="button"
              onClick={onCancel}
            >
              Cancel
            </DivineButton>
            {availableCount > 0 && (
              <DivineButton variant="flame" fullWidth={false} type="button" onClick={onProceed}>
                Add {availableCount} Available Item
                {availableCount > 1 ? "s" : ""}
              </DivineButton>
            )}
          </div>
    </PosFlipModal>
  );
}

function BookingSuccessView({
  confirmation,
  paymentModes,
  onNewTransaction,
  onPaymentRecorded,
  onDisplayState,
}: {
  confirmation: BookingConfirmation;
  paymentModes: PaymentMode[];
  onNewTransaction: () => void;
  onPaymentRecorded: (result: RecordPaymentResult) => void;
  onDisplayState?: (payload: PosDisplayPayload) => void;
}) {
  // Until the booking is fully paid, the only action is "Pay Again" —
  // cashiers cannot skip a remaining balance from this screen. Booking
  // success (and New Transaction) appear only after balance is $0.00.
  const stillDue = confirmation.balanceAmount > 0.005;
  const [payAgainOpen, setPayAgainOpen] = useState(stillDue);
  const [amountInput, setAmountInput] = useState(stillDue ? confirmation.balanceAmount.toFixed(2) : "");
  const [modeId, setModeId] = useState(
    paymentModes.find((m) => m.name.toLowerCase() === "cash")?._id || "",
  );
  const [submitting, setSubmitting] = useState(false);
  // Drives the success popup — set from the API response the moment a
  // payment lands, cleared when the cashier dismisses it. A toast alone
  // (the previous behaviour) was too easy to miss at a busy counter; this
  // needs an explicit acknowledgment.
  const [paymentPopup, setPaymentPopup] = useState<RecordPaymentResult | null>(null);
  const [grandOpen, setGrandOpen] = useState(() => confirmation.balanceAmount <= 0.005);
  const wasDue = useRef(confirmation.balanceAmount > 0.005);
  // Set while a PayNow top-up QR is open — see submitPayAgain's PayNow
  // branch. Kept separate from the main checkout's `paynowQr` state (a
  // different component entirely); this one has no order to poll (the
  // booking's already confirmed), so its onPoll below watches the
  // booking's own balance instead — see PaynowQrModal's own comment on why
  // `onPoll` is generic.
  const [payAgainQr, setPayAgainQr] = useState<{ referenceId: string; amount: number; qrImage: string } | null>(null);
  // Same idea as payAgainQr above, for a NETS top-up — see submitPayAgain's
  // NETS branch. Previously missing entirely, which let NETS silently fall
  // through to the Cash-style instant-confirm route below and mark a top-up
  // "paid" with no terminal ever charged.
  const [payAgainNets, setPayAgainNets] = useState<{ referenceId: string; amount: number; manual?: boolean } | null>(null);
  // Same idea, for a Credit Card top-up — see submitPayAgain's Credit Card
  // branch, mirroring the NETS one above exactly.
  const [payAgainCreditCard, setPayAgainCreditCard] = useState<{ referenceId: string; amount: number; manual?: boolean } | null>(null);
  const balanceBeforeTopUp = useRef(confirmation.balanceAmount);
  // Every payment actually collected against this booking during this
  // checkout — the first one from `confirmation` itself, then one more
  // appended each time applyPayAgainResult lands another installment.
  // Session-local (see PosDisplayPaymentEntry's own comment): correct for
  // the normal case of one cashier collecting installments in one sitting,
  // not a retroactive fetch of the booking's full server-side history.
  const [paymentHistory, setPaymentHistory] = useState<{ mode: string; amount: number }[]>(() => [
    { mode: confirmation.paymentModeName, amount: confirmation.amountPaid },
  ]);

  useEffect(() => {
    if (!onDisplayState) return;
    const lines = confirmation.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      lineTotal: l.lineTotal ?? l.unitPrice * l.quantity,
    }));
    const modeName = paymentModes.find((m) => m._id === modeId)?.name ?? confirmation.paymentModeName;
    const payingNow = Number(amountInput);

    if (payAgainQr) {
      onDisplayState({
        phase: "paynow",
        customerName: confirmation.customer.name,
        lines,
        grandTotal: confirmation.grandTotal,
        payingNow: payAgainQr.amount,
        amountPaid: confirmation.amountPaid,
        balanceDue: confirmation.balanceAmount,
        mode: "PAYNOW",
        qrImage: payAgainQr.qrImage,
        referenceId: payAgainQr.referenceId,
        bookingNumber: confirmation.bookingNumber,
        paymentStatus: confirmation.paymentStatus,
      });
      return;
    }
    if (payAgainNets || payAgainCreditCard) {
      const terminal = payAgainNets ?? payAgainCreditCard;
      onDisplayState({
        phase: "terminal",
        customerName: confirmation.customer.name,
        lines,
        grandTotal: confirmation.grandTotal,
        payingNow: terminal!.amount,
        amountPaid: confirmation.amountPaid,
        balanceDue: confirmation.balanceAmount,
        mode: payAgainNets ? "NETS" : "CREDIT CARD",
        referenceId: terminal!.referenceId,
        bookingNumber: confirmation.bookingNumber,
        paymentStatus: confirmation.paymentStatus,
        statusMessage: "Please complete payment on the terminal.",
      });
      return;
    }
    onDisplayState({
      phase: stillDue && payAgainOpen ? "collecting" : "done",
      customerName: confirmation.customer.name,
      lines,
      grandTotal: confirmation.grandTotal,
      payingNow: stillDue && payAgainOpen && !Number.isNaN(payingNow) ? payingNow : confirmation.amountPaid,
      amountPaid: confirmation.amountPaid,
      balanceDue: confirmation.balanceAmount,
      mode: modeName,
      bookingNumber: confirmation.bookingNumber,
      paymentStatus: confirmation.paymentStatus,
      paymentHistory,
    });
  }, [
    onDisplayState,
    confirmation,
    payAgainQr,
    payAgainNets,
    payAgainCreditCard,
    stillDue,
    payAgainOpen,
    amountInput,
    modeId,
    paymentModes,
    paymentHistory,
  ]);

  useEffect(() => {
    if (!stillDue) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stillDue]);

  useEffect(() => {
    if (wasDue.current && !stillDue && !paymentPopup) setGrandOpen(true);
    wasDue.current = stillDue;
  }, [stillDue, paymentPopup]);

  function openPayAgain() {
    setAmountInput(confirmation.balanceAmount.toFixed(2));
    setModeId((prev) => prev || paymentModes.find((m) => m.name.toLowerCase() === "cash")?._id || "");
    setPayAgainOpen(true);
  }

  function applyPayAgainResult(result: RecordPaymentResult) {
    onPaymentRecorded(result);
    setPaymentHistory((prev) => [...prev, { mode: result.paymentModeName, amount: result.amount }]);
    if (result.balanceAmount > 0.005) {
      setPaymentPopup(result);
      setAmountInput(result.balanceAmount.toFixed(2));
    } else {
      setPaymentPopup(null);
      setPayAgainOpen(false);
      setGrandOpen(true);
    }
  }

  async function submitPayAgain(opts: { manual?: boolean } = {}) {
    const amount = Number(amountInput);
    if (amountInput === "" || Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a payment amount greater than $0.00.");
      return;
    }
    if (amount > confirmation.balanceAmount + 0.005) {
      toast.error(`Amount cannot exceed the outstanding balance of ${formatCurrency(confirmation.balanceAmount)}.`);
      return;
    }
    if (!modeId) {
      toast.error("Select a payment mode.");
      return;
    }

    const modeName = paymentModes.find((m) => m._id === modeId)?.name?.toLowerCase();

    if (modeName === "paynow") {
      // No instant confirm here — a QR has to actually be scanned and paid.
      // See PaynowQrModal's render below for how "did it land yet" is
      // detected (this booking is already confirmed, so there's no order
      // status to poll — its balance dropping is the only signal).
      setSubmitting(true);
      try {
        const qrRes = await api.post<ApiEnvelope<{ referenceId: string; amount: number; qrImage: string }>>(
          "/payments/paynow/generate-qr",
          { referenceId: confirmation.referenceId, amount },
        );
        const qr = unwrap(qrRes);
        balanceBeforeTopUp.current = confirmation.balanceAmount;
        setPayAgainQr(qr);
      } catch (err) {
        toast.error(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (modeName === "nets") {
      // Same reasoning as the PayNow branch above — a NETS top-up must go
      // to the actual terminal, not the instant-confirm route below (see
      // POST /pos/booking/bookings/:id/payments's own guard rejecting NETS
      // now). POST /pos/booking/nets/initiate is the referenceId-keyed
      // counterpart to the main checkout's order-id-keyed
      // /orders/:id/nets/initiate — this booking has no live PosOrder
      // response to have gotten an order id from.
      setSubmitting(true);
      try {
        const initRes = await api.post<ApiEnvelope<{ referenceId: string; amount: number; currency: string }>>(
          "/pos/booking/nets/initiate",
          { referenceId: confirmation.referenceId, amount },
        );
        const init = unwrap(initRes);
        balanceBeforeTopUp.current = confirmation.balanceAmount;
        setPayAgainNets({ referenceId: init.referenceId, amount: init.amount, manual: opts.manual });
      } catch (err) {
        toast.error(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (modeName === "credit card") {
      // Same reasoning as the NETS branch above — see POST /pos/booking/
      // bookings/:id/payments's own guard rejecting "CREDIT CARD" too.
      setSubmitting(true);
      try {
        const initRes = await api.post<ApiEnvelope<{ referenceId: string; amount: number; currency: string }>>(
          "/pos/booking/credit-card/initiate",
          { referenceId: confirmation.referenceId, amount },
        );
        const init = unwrap(initRes);
        balanceBeforeTopUp.current = confirmation.balanceAmount;
        setPayAgainCreditCard({ referenceId: init.referenceId, amount: init.amount, manual: opts.manual });
      } catch (err) {
        toast.error(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const r = await api.post<ApiEnvelope<RecordPaymentResult>>(
        `/pos/booking/bookings/${confirmation._id}/payments`,
        { amount, paymentModeId: modeId },
      );
      applyPayAgainResult(unwrap(r));
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    {stillDue && (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-3">
      <motion.div
        initial={{ opacity: 0, y: 48, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        // A spring recomputes its position every single frame based on
        // velocity/physics; a fixed-duration tween is calculated once and
        // just interpolated, so it keeps its smoothness even when the main
        // thread is busy (a network response resolving, etc.) — same
        // visual arc (this damping was already high enough to have barely
        // any overshoot), just cheaper to render under load.
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-maroon/15 bg-white text-center shadow-[0_28px_70px_-24px_rgba(124,21,39,0.45)]"
      >
        <div aria-hidden="true" className="h-1 shrink-0 bg-maroon" />
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
          }}
          className="min-h-0 px-3 py-2.5 sm:px-5 sm:py-3"
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            className="flex items-center justify-center gap-3"
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_6px_16px_-6px_rgba(16,185,129,0.7)]">
              <motion.svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.2, duration: 0.35, ease: "easeOut" }}
                />
              </motion.svg>
            </span>
            <div className="text-left">
              <h2 className="font-display text-[18px] font-bold leading-tight text-ink-100 sm:text-[20px]">
                Partial Payment Success
              </h2>
              <p className="text-[12px] text-ink-500">
                Partial payment received · Inventory updated
              </p>
            </div>
          </motion.div>

          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            <StayOnPageWarning className="!mt-2">
              Do not close or refresh this page until the remaining balance is collected.
            </StayOnPageWarning>
          </motion.div>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            className="my-2 grid grid-cols-2 gap-1.5 text-left sm:grid-cols-4"
          >
            <DetailTile label="Booking No." value={confirmation.bookingNumber} highlight />
            <DetailTile label="Order No." value={confirmation.orderNumber} />
            <DetailTile label="Receipt No." value={confirmation.receiptNo ?? "—"} />
            <DetailTile
              label="Customer"
              value={`${confirmation.customer.name} (${confirmation.customer.customerCode})`}
            />
            <DetailTile label="Payment Mode" value={confirmation.paymentModeName} />
            <DetailTile label="Total Payable" value={formatCurrency(confirmation.grandTotal)} />
            <DetailTile label="Amount Paid" value={formatCurrency(confirmation.amountPaid)} />
            <DetailTile
              label="Balance Due"
              value={formatCurrency(confirmation.balanceAmount)}
              highlight={confirmation.balanceAmount > 0}
            />
          </motion.div>

          {stillDue && !payAgainOpen && (
            <motion.div
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              className="space-y-2 rounded-xl border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-left"
            >
              <p className="text-[12px] text-crimson-500">
                Only partially paid — {formatCurrency(confirmation.balanceAmount)} still due. Collect the remaining
                amount now.
              </p>
              <DivineButton variant="flame" fullWidth type="button" onClick={openPayAgain}>
                Pay Again
              </DivineButton>
            </motion.div>
          )}

          {payAgainOpen && stillDue && (
            <motion.div
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              className="space-y-2 rounded-xl border border-[#f0b4a0]/70 bg-[#faf6f1] px-3 py-2.5 text-left"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <DivineInput
                  staticLabel
                  label={`Amount (max ${formatCurrency(confirmation.balanceAmount)})`}
                  type="number"
                  min={0.01}
                  max={confirmation.balanceAmount}
                  step="0.01"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
                <DivineButton
                  variant="flame"
                  fullWidth={false}
                  type="button"
                  loading={submitting}
                  onClick={() => submitPayAgain()}
                  className="sm:h-10 sm:px-5"
                >
                  Collect Payment
                </DivineButton>
              </div>
              <PaymentModeBoxes dense modes={paymentModes} value={modeId} onChange={setModeId} />
              {(() => {
                const payAgainModeName = paymentModes.find((m) => m._id === modeId)?.name?.toLowerCase();
                if (payAgainModeName !== "nets" && payAgainModeName !== "credit card") return null;
                return (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submitPayAgain({ manual: true })}
                    title="Enter the transaction reference number from the terminal's printed slip instead of waiting for its automatic confirmation."
                    className="w-full rounded-md border border-[#7c1527]/40 bg-transparent px-4 py-1.5 text-[12.5px] font-semibold text-[#7c1527] transition-colors duration-200 hover:bg-[#7c1527]/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Manual Confirm
                  </button>
                );
              })()}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
    )}
    <SuccessModal
      open={grandOpen}
      onClose={onNewTransaction}
      title="Booking Success"
      amountLabel="Total amount paid"
      amount={formatCurrency(confirmation.amountPaid)}
      bookingNo={confirmation.bookingNumber}
      paymentMode={confirmation.paymentModeName}
      amountPaid={formatCurrency(confirmation.amountPaid)}
      cta="Continue"
      paymentHistory={paymentHistory.map((p) => ({ mode: p.mode, amount: formatCurrency(p.amount) }))}
    />
    <PaymentRecordedModal open={!!paymentPopup} result={paymentPopup} onClose={() => setPaymentPopup(null)} />
    <PaynowQrModal
      open={!!payAgainQr}
      referenceId={payAgainQr?.referenceId ?? ""}
      amount={payAgainQr?.amount ?? 0}
      qrImage={payAgainQr?.qrImage ?? ""}
      onPoll={async () => {
        const res = await api.get<
          ApiEnvelope<{
            transactions: { receiptNo: string; amount: number; paymentModeName: string }[];
            amountPaid: number;
            balanceAmount: number;
          }>
        >(`/pos/booking/bookings/${confirmation._id}`);
        const data = unwrap(res);
        // This booking is already confirmed — there's no order status left
        // to transition, so a genuine drop in balance since the QR was
        // generated is the only signal the top-up actually landed.
        if (data.balanceAmount < balanceBeforeTopUp.current - 0.005) {
          return { status: "confirmed" as const, data };
        }
        return { status: "pending" as const };
      }}
      onConfirmed={(raw) => {
        const data = raw as { transactions: { receiptNo: string; amount: number; paymentModeName: string }[]; amountPaid: number; balanceAmount: number };
        const latestTxn = data.transactions[data.transactions.length - 1];
        setPayAgainQr(null);
        applyPayAgainResult({
          receiptNo: latestTxn?.receiptNo ?? "",
          amount: +(balanceBeforeTopUp.current - data.balanceAmount).toFixed(2),
          paymentModeName: latestTxn?.paymentModeName ?? "PAYNOW",
          paymentStatus: data.balanceAmount <= 0.005 ? "paid" : "partial",
          amountPaid: data.amountPaid,
          balanceAmount: data.balanceAmount,
        });
      }}
      onCancel={() => setPayAgainQr(null)}
    />
    <NetsPaymentModal
      open={!!payAgainNets}
      referenceId={payAgainNets?.referenceId ?? ""}
      amount={payAgainNets?.amount ?? 0}
      onPoll={async () => {
        const res = await api.get<
          ApiEnvelope<{
            transactions: { receiptNo: string; amount: number; paymentModeName: string }[];
            amountPaid: number;
            balanceAmount: number;
          }>
        >(`/pos/booking/bookings/${confirmation._id}`);
        const data = unwrap(res);
        // Same reasoning as PaynowQrModal's onPoll above — this booking is
        // already confirmed, so a genuine drop in balance since the
        // terminal was sent this payment is the only signal it landed.
        if (data.balanceAmount < balanceBeforeTopUp.current - 0.005) {
          return { status: "confirmed" as const, data };
        }
        return { status: "pending" as const };
      }}
      onConfirmed={(raw) => {
        const data = raw as { transactions: { receiptNo: string; amount: number; paymentModeName: string }[]; amountPaid: number; balanceAmount: number };
        const latestTxn = data.transactions[data.transactions.length - 1];
        setPayAgainNets(null);
        applyPayAgainResult({
          receiptNo: latestTxn?.receiptNo ?? "",
          amount: +(balanceBeforeTopUp.current - data.balanceAmount).toFixed(2),
          paymentModeName: latestTxn?.paymentModeName ?? "NETS",
          paymentStatus: data.balanceAmount <= 0.005 ? "paid" : "partial",
          amountPaid: data.amountPaid,
          balanceAmount: data.balanceAmount,
        });
      }}
      onCancel={() => setPayAgainNets(null)}
      startInManualMode={!!payAgainNets?.manual}
      onManualConfirm={async (transactionRefNo) => {
        try {
          await api.post(`/pos/booking/manual-confirm`, {
            referenceId: payAgainNets?.referenceId,
            transactionRefNo,
          });
        } catch (err) {
          throw new Error(extractErrorMessage(err));
        }
      }}
    />
    <NetsPaymentModal
      open={!!payAgainCreditCard}
      kind="CREDIT_CARD"
      referenceId={payAgainCreditCard?.referenceId ?? ""}
      amount={payAgainCreditCard?.amount ?? 0}
      onPoll={async () => {
        const res = await api.get<
          ApiEnvelope<{
            transactions: { receiptNo: string; amount: number; paymentModeName: string }[];
            amountPaid: number;
            balanceAmount: number;
          }>
        >(`/pos/booking/bookings/${confirmation._id}`);
        const data = unwrap(res);
        if (data.balanceAmount < balanceBeforeTopUp.current - 0.005) {
          return { status: "confirmed" as const, data };
        }
        return { status: "pending" as const };
      }}
      onConfirmed={(raw) => {
        const data = raw as { transactions: { receiptNo: string; amount: number; paymentModeName: string }[]; amountPaid: number; balanceAmount: number };
        const latestTxn = data.transactions[data.transactions.length - 1];
        setPayAgainCreditCard(null);
        applyPayAgainResult({
          receiptNo: latestTxn?.receiptNo ?? "",
          amount: +(balanceBeforeTopUp.current - data.balanceAmount).toFixed(2),
          paymentModeName: latestTxn?.paymentModeName ?? "CREDIT CARD",
          paymentStatus: data.balanceAmount <= 0.005 ? "paid" : "partial",
          amountPaid: data.amountPaid,
          balanceAmount: data.balanceAmount,
        });
      }}
      onCancel={() => setPayAgainCreditCard(null)}
      startInManualMode={!!payAgainCreditCard?.manual}
      onManualConfirm={async (transactionRefNo) => {
        try {
          await api.post(`/pos/booking/manual-confirm`, {
            referenceId: payAgainCreditCard?.referenceId,
            transactionRefNo,
          });
        } catch (err) {
          throw new Error(extractErrorMessage(err));
        }
      }}
    />
    </>
  );
}

/** Confirms one installment landed — shown by "Pay Again" the moment the
 *  API responds, so collecting a payment gets an explicit acknowledgment
 *  instead of just the numbers on the card quietly changing underneath it. */
function PaymentRecordedModal({
  open,
  result: resultProp,
  onClose,
}: {
  open: boolean;
  result: RecordPaymentResult | null;
  onClose: () => void;
}) {
  const held = useRef(resultProp);
  if (resultProp) held.current = resultProp;
  const result = held.current;
  return (
    <PosFlipModal
      open={open}
      onBackdrop={onClose}
      panelClassName="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-gold-500/25 bg-white p-5 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
    >
          {result && (
          <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold-400 bg-gold-500/15">
            <svg className="h-7 w-7 text-[#d4a017]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="font-display text-[19px] font-bold text-ink-100">
            Partial Payment Success
          </h3>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Collected — a balance is still due. Continue paying until the balance is $0.00.
          </p>
          <div className="my-5 space-y-1.5 rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-3.5 text-left text-[13px]">
            <Row label="Amount Collected" value={formatCurrency(result.amount)} highlight />
            <Row label="Payment Mode" value={result.paymentModeName} />
            <Row label="Receipt No." value={result.receiptNo} />
            <div className="border-t border-gold-500/10 pt-1.5">
              <Row label="Total Paid So Far" value={formatCurrency(result.amountPaid)} />
              <Row label="Balance Due" value={formatCurrency(result.balanceAmount)} highlight />
            </div>
          </div>
          <DivineButton variant="flame" fullWidth onClick={onClose}>
            OK
          </DivineButton>
          </>
          )}
    </PosFlipModal>
  );
}

function DetailTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-[#f0b4a0]/60 bg-[#fffdfb] px-2.5 py-1.5 text-left">
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-maroon/70">{label}</p>
      <p
        className={`mt-px truncate text-[12.5px] ${
          highlight ? "font-bold text-[#c9a227]" : "font-semibold text-ink-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: React.ReactNode;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span
        className={
          highlight ? "font-bold text-[#d4a017]" : "font-medium text-ink-100"
        }
      >
        {value}
      </span>
    </div>
  );
}
