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
import { formatTempleDateTime } from "../../lib/datetime";
import { sanitizeMobileInput, isValidSgMobile, SG_MOBILE_ERROR } from "../../lib/mobileNumber";
import DivineInput from "../divine/DivineInput";
import DivineButton from "../divine/DivineButton";
import { StayOnPageWarning } from "../divine/StatusBanner";
import { EmblemLoader, EmblemLoaderOverlay } from "../divine/EmblemLoader";
import { resolveImageUrl } from "../../lib/imageUrl";
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
const FIELD_ACCENT =
  "ring-1 ring-[#ead9c6] shadow-[0_2px_10px_-8px_rgba(124,21,39,0.12)] hover:ring-[#7c1527]/25";

const POS_BTN_ON =
  "border-[#7c1527] bg-[#7c1527] text-white hover:bg-[#681221]";
const POS_BTN_OFF =
  "border-[#ead9c6] bg-white text-ink-300 hover:border-[#7c1527]/35 hover:bg-[#faf6f1] hover:text-[#7c1527]";

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
type CreateOrderResult = ({ status: "confirmed" } & BookingConfirmation) | { status: "pending"; _id: string };
type OrderStatusResult = ({ status: "confirmed" } & BookingConfirmation) | { status: "pending" | "cancelled" | "expired" };

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
          prev.map((line) => {
            const sl = data.lines.find(
              (d) => d.refId === line.refId && d.refType === line.refType,
            );
            if (!sl) return line;
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
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(
    null,
  );

  const hasStockIssues = cart.some((l) => l.quantityExceedsStock);
  const canProceed =
    selectedCustomer && cart.length > 0 && !hasStockIssues && !summaryLoading;
  const cashMode = paymentModes.find((m) => m.name.toLowerCase() === "cash");
  const selectedModeName =
    paymentModes.find((m) => m._id === selectedPaymentModeId)?.name ?? "Cash";
  // Items are sitting in the cart with nobody to book them for — call it
  // out right at the search box instead of only at the disabled checkout
  // button, which is easy to miss until the very end.
  const needsCustomerForCart = cart.length > 0 && !selectedCustomer;

  async function handleConfirmBooking() {
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
      const booking =
        created.status === "confirmed"
          ? created
          : await pollOrderStatus("/pos/booking/orders", created._id);
      setConfirmation(booking);
      setStep("done");
      toast.created(
        booking.paymentStatus === "paid"
          ? `Booking ${booking.bookingNumber} confirmed!`
          : `Booking ${booking.bookingNumber} confirmed with a partial payment — ${formatCurrency(booking.balanceAmount)} still due.`,
      );
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
    setPaymentAmountInput("");
    lineCounter = 0;
    const cash = paymentModes.find((m) => m.name.toLowerCase() === "cash");
    setSelectedPaymentModeId(cash?._id ?? "");
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (step === "done" && confirmation) {
    return (
      <PosShell user={user}>
        <BookingSuccessView
          confirmation={confirmation}
          paymentModes={paymentModes}
          onNewTransaction={startNewTransaction}
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
    <PosShell user={user} onNewTransaction={startNewTransaction}>
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 [perspective:1400px] lg:h-full lg:grid-cols-[260px_1fr_360px] lg:overflow-hidden">
        {/* ── LEFT: customer panel ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -48, rotateY: 14 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="relative flex flex-col gap-3 overflow-hidden rounded-md border border-white/70 bg-white/90 p-4 shadow-[0_8px_28px_-14px_rgba(179,39,63,0.25)] backdrop-blur-md lg:h-full lg:overflow-y-auto"
        >
          {!selectedCustomer && <PanelGlow />}
          <p className="font-accent text-[16px] font-extrabold tracking-tight text-ink-100">
            Customer
          </p>
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
              label="Search customer…"
              icon={<SearchIcon />}
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                if (selectedCustomer) clearCustomer();
              }}
              disabled={!!selectedCustomer}
              loading={customerSearching}
              containerClassName={FIELD_ACCENT}
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
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-600">
                <HistoryIcon /> Recent Transactions
              </p>
              {recentBookings.map((b) => (
                <button
                  key={b._id}
                  type="button"
                  onClick={() => setViewingRecentBooking(b)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md border border-orange-200/60 bg-white/60 px-3 py-2.5 text-left shadow-[0_2px_10px_-6px_rgba(255,122,46,0.3)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_10px_22px_-12px_rgba(255,122,46,0.45)]"
                >
                  <span className="flex w-full items-center justify-between text-[12.5px] font-medium text-ink-100">
                    <span className="tabular-nums">{b.bookingNumber}</span>
                    <span className="text-amber-600">
                      {formatCurrency(b.grandTotal)}
                    </span>
                  </span>
                  <span className="text-[11px] text-ink-500">
                    {formatTempleDateTime(b.bookedAt)} · {b.lines.length}{" "}
                    item(s)
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── CENTER: catalogue ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 40, rotateX: 12 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.06 }}
          className="flex min-w-0 flex-col overflow-hidden rounded-md border border-white/70 bg-white/90 shadow-[0_8px_28px_-14px_rgba(179,39,63,0.25)] backdrop-blur-md lg:h-full"
        >
          <div className="space-y-3 p-4 pb-2">
            <DivineInput
              label="Search offerings…"
              icon={<SearchIcon />}
              value={offeringSearch}
              onChange={(e) => setOfferingSearch(e.target.value)}
              loading={searchLoading}
              containerClassName={FIELD_ACCENT}
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSelectedCategoryId("");
                  setActiveFolder(null);
                }}
                className={`rounded-md border px-3.5 py-1.5 text-[12.5px] font-medium transition-[transform,box-shadow,background-color,color] duration-200 hover:-translate-y-0.5 ${
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
                  className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 text-[12.5px] font-medium transition-[transform,box-shadow,background-color,color] duration-200 hover:-translate-y-0.5 ${
                    selectedCategoryId === c._id ? POS_BTN_ON : POS_BTN_OFF
                  }`}
                >
                  {catImg ? (
                    <img src={catImg} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-white/40" />
                  ) : null}
                  {c.name} ({c.count})
                </button>
                );
              })}
            </div>
          </div>

          <div className="px-4">
            <SectionScreenDivider />
          </div>

          <div className="p-4 pt-2 lg:flex-1 lg:overflow-y-auto">
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
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
          className="flex flex-col overflow-hidden rounded-md border border-white/70 bg-white/90 shadow-[0_8px_28px_-14px_rgba(179,39,63,0.25)] backdrop-blur-md lg:h-full"
        >
          <div className="flex shrink-0 items-center justify-between bg-[#7c1527] px-4 py-3">
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
                className="flex items-center gap-1.5 rounded-md border border-white bg-white px-3 py-1.5 text-[11.5px] font-semibold text-crimson-600 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-crimson-500/10"
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
                  <p className="text-[13px] font-medium text-ink-300">
                    No items or services added
                  </p>
                  <p className="text-[11.5px] text-ink-500">
                    Select an offering to begin the transaction.
                  </p>
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

            <div className="mt-3 border-t-2 border-orange-200/80 pt-3 text-[13px]">
              <div className="flex items-center justify-between font-bold text-ink-100">
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
            </div>

            <div className="mt-3 space-y-1.5">
              <PaymentModeBoxes
                modes={paymentModes}
                value={selectedPaymentModeId}
                onChange={setSelectedPaymentModeId}
              />
            </div>

            {/* Partial payment: how much is being collected right now.
                Defaults to the full total — only needs a touch to take less. */}
            <div className="mt-3 space-y-1.5">
              <DivineInput
                label="Payment Amount (S$)"
                type="number"
                min={0}
                max={summary?.grandTotal ?? undefined}
                step="0.01"
                inputMode="decimal"
                value={paymentAmountInput}
                onChange={(e) => setPaymentAmountInput(e.target.value)}
                error={
                  paymentAmountInput !== "" && !paymentAmountValid
                    ? `Enter an amount between $0.00 and ${formatCurrency(summary?.grandTotal ?? 0)}.`
                    : undefined
                }
              />
              <div
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-[11.5px] ${
                  isPartialPayment ? "bg-crimson-500/10 text-crimson-500" : "bg-emerald-500/10 text-emerald-700"
                }`}
              >
                <span>Balance Amount (after this payment)</span>
                <span className="font-semibold">{formatCurrency(paymentBalanceAmount)}</span>
              </div>
              {isPartialPayment && (
                <p className="text-[10.5px] text-ink-500">
                  Booking confirms now for the full order — collect the rest anytime from POS Transactions.
                </p>
              )}
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
                disabled={
                  !canProceed || !selectedPaymentModeId || bookingLoading || !paymentAmountValid
                }
                className="w-full justify-center"
              >
                {bookingLoading
                  ? "Confirming…"
                  : isPartialPayment
                    ? `Confirm ${selectedModeName} Payment (Partial)`
                    : `Confirm ${selectedModeName} Payment`}
              </FlameActionButton>
            </div>
          </div>
        </motion.div>
      </div>

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
      <div
        aria-hidden="true"
        className="h-1.5 shrink-0 bg-dark-orange"
      />
      <header className="relative z-20 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/70 bg-white/92 px-3 py-2.5 shadow-[0_8px_28px_-8px_rgba(179,39,63,0.22)] backdrop-blur-md sm:px-6 sm:py-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center">
          <motion.img
            src="/SSD_Full_Logo.png"
            alt="Sri Siva Durga Temple"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="h-14 w-auto max-w-[240px] shrink-0 object-contain sm:h-16 sm:max-w-[280px] lg:h-[68px] lg:max-w-[320px]"
          />
        </div>

        {/* Grouped and centered as one cluster — grid-cols-[1fr_auto_1fr] on
            the header keeps this column mathematically centered regardless
            of how wide the logo or the clock/avatar column end up being. */}
        <div className="col-start-2 hidden items-center justify-center gap-2 md:flex">
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
        </div>

        <div className="col-start-3 flex min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <TempleClock variant="flame" />
          </div>
          <div className="relative">
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

/** Popups fly in from below the screen and flip into the center, with sparks.
 *  `open` must stay true until the caller wants them gone — AnimatePresence
 *  can only play the closing flip if this component remains mounted. */
function PosFlipModal({
  open,
  onBackdrop,
  panelClassName,
  tone = "default",
  children,
}: {
  open: boolean;
  onBackdrop?: () => void;
  panelClassName: string;
  tone?: "default" | "gold";
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const gold = tone === "gold";
  const root = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
    leave: { transition: { when: "afterChildren" as const } },
  };
  const dim = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.25 } },
    leave: { opacity: 0, transition: { duration: 0.28, delay: 0.08 } },
  };
  const card = reduce
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1 },
        leave: { opacity: 0, transition: { duration: 0.2 } },
      }
    : {
        hidden: { opacity: 1 },
        show: { opacity: 1 },
        leave: {
          opacity: 0,
          rotateY: -70,
          scale: 0.78,
          transition: { duration: 0.38, ease: [0.55, 0, 0.75, 0.15] as const },
        },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pos-flip"
          className="fixed inset-0 z-50"
          variants={root}
          initial="hidden"
          animate="show"
          exit="leave"
        >
          <motion.div
            variants={dim}
            onClick={onBackdrop}
            className={`absolute inset-0 backdrop-blur-[6px] ${gold ? "bg-[#3a2208]/55" : "bg-navy-950/55"}`}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden p-4 [perspective:1600px]">
            <PosSparkField />
            <motion.div
              variants={card}
              onClick={(e) => e.stopPropagation()}
              style={{ transformOrigin: "50% 50%", transformStyle: "preserve-3d" }}
              className={`pointer-events-auto relative ${reduce ? "" : "ssd-flip-in"} ${panelClassName}`}
            >
              {gold && (
                <>
                  <span aria-hidden="true" className="pos-gold-ring pointer-events-none absolute left-1/2 top-8 h-24 w-24 -translate-x-1/2 rounded-full border-2 border-gold-400/70" />
                  <span aria-hidden="true" className="pos-gold-ring pointer-events-none absolute left-1/2 top-8 h-24 w-24 -translate-x-1/2 rounded-full border border-flame-400/50 [animation-delay:0.45s]" />
                </>
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent"
              />
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SSD_FALLING_STARS = [
  { dx: "-18vw", dy: "-8vh", delay: "0.02s", size: 14, dur: "1.55s" },
  { dx: "16vw", dy: "-12vh", delay: "0.08s", size: 11, dur: "1.7s" },
  { dx: "-28vw", dy: "2vh", delay: "0.14s", size: 9, dur: "1.85s" },
  { dx: "24vw", dy: "-4vh", delay: "0.05s", size: 13, dur: "1.6s" },
  { dx: "-8vw", dy: "-16vh", delay: "0.18s", size: 8, dur: "1.95s" },
  { dx: "10vw", dy: "-18vh", delay: "0.11s", size: 12, dur: "1.75s" },
  { dx: "-34vw", dy: "-6vh", delay: "0.22s", size: 10, dur: "2.05s" },
  { dx: "32vw", dy: "4vh", delay: "0.16s", size: 9, dur: "1.9s" },
  { dx: "-14vw", dy: "8vh", delay: "0.28s", size: 7, dur: "2.1s" },
  { dx: "20vw", dy: "10vh", delay: "0.2s", size: 11, dur: "1.8s" },
  { dx: "-22vw", dy: "-20vh", delay: "0.09s", size: 8, dur: "2s" },
  { dx: "6vw", dy: "-22vh", delay: "0.25s", size: 15, dur: "1.65s" },
  { dx: "-40vw", dy: "0vh", delay: "0.31s", size: 9, dur: "2.15s" },
  { dx: "38vw", dy: "-10vh", delay: "0.12s", size: 10, dur: "1.88s" },
  { dx: "0vw", dy: "-24vh", delay: "0.04s", size: 12, dur: "1.72s" },
  { dx: "-12vw", dy: "14vh", delay: "0.35s", size: 8, dur: "2.2s" },
];

const SSD_STAR_RAIN = [
  { left: "8%", delay: "0.38s", dur: "2.35s", size: 10 },
  { left: "18%", delay: "0.55s", dur: "2.55s", size: 8 },
  { left: "28%", delay: "0.42s", dur: "2.2s", size: 12 },
  { left: "38%", delay: "0.7s", dur: "2.7s", size: 7 },
  { left: "48%", delay: "0.48s", dur: "2.4s", size: 11 },
  { left: "58%", delay: "0.62s", dur: "2.5s", size: 9 },
  { left: "68%", delay: "0.4s", dur: "2.25s", size: 13 },
  { left: "78%", delay: "0.78s", dur: "2.65s", size: 8 },
  { left: "88%", delay: "0.52s", dur: "2.45s", size: 10 },
  { left: "12%", delay: "0.9s", dur: "2.8s", size: 7 },
  { left: "72%", delay: "0.85s", dur: "2.6s", size: 9 },
];

const SSD_BLAST_SPARKS = [
  { sx: "-72px", sy: "-48px", delay: "0s" },
  { sx: "80px", sy: "-40px", delay: "0.04s" },
  { sx: "-90px", sy: "18px", delay: "0.08s" },
  { sx: "96px", sy: "22px", delay: "0.06s" },
  { sx: "-40px", sy: "-88px", delay: "0.1s" },
  { sx: "36px", sy: "-92px", delay: "0.02s" },
  { sx: "-110px", sy: "-12px", delay: "0.12s" },
  { sx: "118px", sy: "-8px", delay: "0.09s" },
  { sx: "0px", sy: "70px", delay: "0.05s" },
  { sx: "-55px", sy: "64px", delay: "0.14s" },
];

function GoldStar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#d4af37" aria-hidden>
      <path d="M12 1.8l2.55 6.62 7.15.42-5.5 4.46 1.78 6.92L12 16.7 6.02 20.22l1.78-6.92-5.5-4.46 7.15-.42L12 1.8z" />
    </svg>
  );
}

function HebInspiredSuccessModal({
  open,
  onClose,
  title,
  amountLabel,
  amount,
  bookingNo,
  paymentMode,
  amountPaid,
  cta = "Continue",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  amountLabel: string;
  amount: string;
  bookingNo?: string;
  paymentMode?: string;
  amountPaid?: string;
  cta?: string;
}) {
  const heading = title === "Booking Success" ? "Booking Successful!" : title;
  const paid = amountPaid ?? amount;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ssd-success"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 [perspective:1200px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
        >
          <motion.div
            className="absolute inset-0 bg-[#1a140c]/70 backdrop-blur-[16px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <div className="pointer-events-none absolute inset-0 z-[81] overflow-hidden">
            <span
              className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#d4af37]"
              style={{ animation: "ssd-blast-ring 0.85s ease-out 0.78s both" }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f6e59b]"
              style={{ animation: "ssd-blast-ring 1.15s ease-out 0.84s both" }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d4af37]/30"
              style={{ animation: "ssd-blast-ring 0.7s ease-out 0.78s both" }}
            />
            {SSD_BLAST_SPARKS.map((p, i) => (
              <span
                key={`spark-${i}`}
                className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-[#f6e59b] shadow-[0_0_10px_#d4af37]"
                style={
                  {
                    animation: `ssd-spark-pop 0.7s ease-out calc(0.78s + ${p.delay}) both`,
                    "--sx": p.sx,
                    "--sy": p.sy,
                  } as CSSProperties
                }
              />
            ))}
            {SSD_FALLING_STARS.map((s, i) => (
              <span
                key={`burst-${i}`}
                className="absolute left-1/2 top-[42%] drop-shadow-[0_0_6px_rgba(212,175,55,0.9)]"
                style={
                  {
                    animation: `ssd-star-burst ${s.dur} ease-out calc(0.78s + ${s.delay}) both`,
                    "--dx": s.dx,
                    "--dy": s.dy,
                  } as CSSProperties
                }
              >
                <GoldStar size={s.size} />
              </span>
            ))}
            {SSD_STAR_RAIN.map((s, i) => (
              <span
                key={`rain-${i}`}
                className="absolute top-0 drop-shadow-[0_0_5px_rgba(212,175,55,0.85)]"
                style={{
                  left: s.left,
                  animation: `ssd-star-fall ${s.dur} linear calc(0.82s + ${s.delay}) both`,
                }}
              >
                <GoldStar size={s.size} />
              </span>
            ))}
          </div>
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, rotateY: -70, scale: 0.78 }}
            transition={{ duration: 0.32 }}
            className="ssd-flip-stamp relative z-[82] w-full max-w-[26rem] overflow-hidden rounded-[28px] border border-[#ffd54a]/60 bg-[#fffdf8] shadow-[0_28px_70px_rgba(40,24,8,0.45)]"
          >
            <div
              className="relative bg-[#f7efd8] bg-cover bg-[center_top] px-5 pb-3 pt-3 text-center"
              style={{ backgroundImage: "url('/Payment_Success_Popup_Background.png')" }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[#d4af37]/70 bg-white/70 text-[#5c3d0d] transition hover:rotate-90 hover:bg-white"
              >
                ✕
              </button>
              <img
                src="/SSD_Full_Logo-Transparant.png"
                alt="Sri Siva Durga Temple"
                className="relative z-10 mx-auto h-[3.5rem] w-auto max-w-[200px] object-contain"
              />
              <div className="relative mx-auto mt-2 mb-2 flex h-16 w-16 items-center justify-center">
                <span
                  className="absolute inset-[-6px] rounded-full border border-[#d4af37]/50"
                  style={{ animation: "ssd-sc-ring 1.1s ease-out 0.82s both" }}
                />
                <span className="ssd-gold-tick relative z-10 flex h-16 w-16 items-center justify-center rounded-full">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline className="ssd-sc-chk" points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </div>
              <h2 className="ssd-success-title relative font-display text-[32px] font-black leading-tight">
                {heading}
              </h2>
              <p className="relative mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ef7d1a]">
                {amountLabel}
              </p>
              <p className="ssd-success-title relative mt-1 font-sans text-[40px] font-black tracking-tight">{amount}</p>
            </div>
            <div className="bg-white px-4 pb-4 pt-2">
              <div className="mb-3 flex h-4 items-center gap-2">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#ffd54a]" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffd54a" aria-hidden>
                  <path d="M12 2l1.8 5.4H19l-4.2 3.2 1.6 5.4L12 13.2 7.6 16l1.6-5.4L5 7.4h5.2L12 2z" />
                </svg>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#ffd54a]" />
              </div>
              <div className="grid grid-cols-3 divide-x divide-[#ead9b4] text-center">
                <div className="px-2 py-1">
                  <svg className="mx-auto mb-1 h-5 w-5 text-[#e6b422]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M8 3v4M16 3v4M3 10h18" />
                  </svg>
                  <p className="text-[10px] text-ink-500">Booking ID</p>
                  <p className="mt-0.5 truncate font-sans text-[11.5px] font-bold text-ink-100">{bookingNo ?? "—"}</p>
                </div>
                <div className="px-2 py-1">
                  <svg className="mx-auto mb-1 h-5 w-5 text-[#e6b422]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                  <p className="text-[10px] text-ink-500">Amount Paid</p>
                  <p className="mt-0.5 font-sans text-[13px] font-bold text-ink-100">{paid}</p>
                </div>
                <div className="px-2 py-1">
                  <svg className="mx-auto mb-1 h-5 w-5 text-[#e6b422]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <rect x="2" y="7" width="20" height="12" rx="2" />
                    <path d="M6 11h4M16 15h2" />
                  </svg>
                  <p className="text-[10px] text-ink-500">Payment Mode</p>
                  <p className="mt-0.5 truncate font-sans text-[13px] font-bold text-ink-100">{paymentMode ?? "—"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ssd-gold-btn mt-3 flex w-full items-center justify-center gap-1 rounded-2xl py-3 font-sans text-[16px] font-bold text-white shadow-[0_10px_24px_rgba(239,125,26,0.45)] transition hover:-translate-y-0.5"
              >
                {cta}
                <span aria-hidden>›</span>
              </button>
            </div>
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
            exit={{ opacity: 0, rotateY: -70, scale: 0.78 }}
            transition={{ duration: 0.32 }}
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
 * The section break between the category pill row and the folder/offering
 * grid below it — a solid accent bar.
 */
function SectionScreenDivider() {
  return (
    <div aria-hidden="true" className="relative my-2 flex h-5 items-center justify-center">
      <div
        className="relative h-1.5 w-full bg-dark-orange"
        style={{ clipPath: "polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)" }}
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

function PaymentModeBoxes({
  modes,
  value,
  onChange,
}: {
  modes: PaymentMode[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-600">
        <CashIcon className="h-3.5 w-3.5" /> Payment Method
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {modes.map((m) => {
          const isCash = m.name.toLowerCase() === "cash";
          const selected = isCash && value === m._id;
          if (!isCash) {
            return (
              <button
                key={m._id}
                type="button"
                disabled
                aria-disabled="true"
                title={`${m.name} isn't available yet`}
                className="flex cursor-not-allowed flex-col items-center gap-0.5 rounded-lg border-2 border-dashed border-gold-500/20 bg-ivory-50/60 px-2 py-1.5 text-center opacity-45"
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
              whileHover={{ y: -3, scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className={`group relative flex flex-col items-center gap-1 overflow-hidden rounded-lg border-2 px-2 py-2.5 text-center ${
                selected
                  ? "pos-pay-tile-on border-transparent bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-400"
                  : "border-gold-500/25 bg-white shadow-[0_2px_8px_-6px_rgba(0,0,0,0.2)] hover:border-flame-400/60"
              }`}
            >
              {selected && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                  <span className="pos-pay-shine" />
                </span>
              )}
              <AnimatePresence initial={false}>
                {selected && (
                  <motion.span
                    initial={{ scale: 0, rotate: -90, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 18 }}
                    className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/25"
                  >
                    <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
              <motion.span
                animate={selected ? { rotate: [0, -8, 8, 0], scale: [1, 1.12, 1] } : { rotate: 0, scale: 1 }}
                transition={{ duration: 0.45 }}
              >
                <CashIcon className={`h-4 w-4 ${selected ? "text-white" : "text-emerald-600"}`} />
              </motion.span>
              <span className={`relative text-[11.5px] font-semibold ${selected ? "text-white" : "text-ink-100"}`}>
                {m.name}
              </span>
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
      className={`flex w-full min-w-0 items-center justify-between gap-1 rounded-md px-2 py-1 ${theme.rowBg}`}
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
      className={`group relative rounded-md border-2 ${theme.border} ${theme.bodyBg} text-left shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)] transition-shadow duration-200 hover:shadow-[0_16px_32px_-12px_rgba(0,0,0,0.5)] disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <div className={`flex h-full flex-col overflow-hidden rounded-[3px] ${theme.bodyBg}`}>
        <div className={`relative overflow-hidden ${theme.banner} ${cover ? "h-[9.5rem]" : "h-14"}`}>
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
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
      className={`rounded-md border p-3 shadow-[0_2px_10px_-6px_rgba(255,122,46,0.25)] transition-shadow duration-200 ${line.quantityExceedsStock ? "border-crimson-500/30 bg-crimson-500/5" : "border-orange-200/60 bg-white/70 hover:shadow-[0_8px_20px_-14px_rgba(255,122,46,0.5)]"}`}
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
  devoteeNameSuggestions?: string[];
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
      panelClassName="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_30px_80px_-20px_rgba(179,39,63,0.4)]"
    >
          {offering && (
          <>
          <div
            aria-hidden="true"
            className="h-1.5 shrink-0 bg-dark-orange"
          />
          <div className="flex items-start justify-between border-b border-gold-500/10 px-6 py-5">
            <div>
              {isEditing && (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                  Editing cart line
                </p>
              )}
              <h2 className="font-accent text-[19px] font-extrabold tracking-tight text-ink-100">
                {offering.name}
              </h2>
              {offering.tamilName && (
                <p className="text-[13px] text-ink-500">{offering.tamilName}</p>
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

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {offering.isDeityMappingRequired && deityOptions.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">
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
                <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">Quantity</p>
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
                <p className="text-[11px] uppercase tracking-wide text-amber-600">
                  Devotee Details (max {offering.maxFamilyMembers}) *
                </p>
                {devoteeNameSuggestions &&
                  devoteeNameSuggestions.length > 0 && (
                    <datalist id="devotee-name-suggestions">
                      {devoteeNameSuggestions.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  )}
                {devotees.map((devotee, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_140px_auto] items-start gap-2"
                  >
                    <DivineInput
                      label={`${idx + 1}.`}
                      value={devotee.name}
                      onChange={(e) => {
                        const updated = [...devotees];
                        updated[idx] = {
                          ...updated[idx],
                          name: e.target.value,
                        };
                        onDevoteesChange(updated);
                      }}
                      list={
                        devoteeNameSuggestions &&
                        devoteeNameSuggestions.length > 0
                          ? "devotee-name-suggestions"
                          : undefined
                      }
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
      panelClassName="w-full max-w-xl overflow-hidden rounded-2xl border border-gold-500/25 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
    >
          <div className="border-b border-gold-500/10 px-6 py-5">
            <h2 className="font-display text-[18px] font-bold text-ink-100">
              Create Customer
            </h2>
            <p className="text-[12.5px] text-ink-500">
              Quick walk-in profile — no login required.
            </p>
          </div>
          <div className="px-6 py-5">
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
                icon={<span className="text-[13.5px] font-semibold text-ink-500">+65</span>}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(sanitizeMobileInput(e.target.value))}
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
            {error && (
              <p className="mt-3 text-[12.5px] text-crimson-500">{error}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-gold-500/10 px-6 py-4">
            <DivineButton
              variant="ghost"
              fullWidth={false}
              type="button"
              onClick={onClose}
            >
              Cancel
            </DivineButton>
            <DivineButton
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
      panelClassName="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_30px_80px_-20px_rgba(179,39,63,0.4)]"
    >
          {booking && (
          <>
          <div className="flex items-start justify-between border-b border-gold-500/10 px-6 py-5">
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

          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
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

          <div className="flex items-center justify-between border-t border-gold-500/10 px-6 py-4">
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
      panelClassName="w-full max-w-md overflow-hidden rounded-2xl border border-gold-500/25 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
    >
          <div className="border-b border-gold-500/10 px-6 py-5">
            <h2 className="font-display text-[18px] font-bold text-ink-100">
              Some items aren&apos;t available
            </h2>
            <p className="text-[12.5px] text-ink-500">
              {availableCount > 0
                ? `${availableCount} item(s) from this booking are still available. The rest can't be re-added right now:`
                : "None of this booking's items can be re-added right now:"}
            </p>
          </div>
          <div className="max-h-[40vh] space-y-2 overflow-y-auto px-6 py-5">
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
          <div className="flex justify-end gap-3 border-t border-gold-500/10 px-6 py-4">
            <DivineButton
              variant="ghost"
              fullWidth={false}
              type="button"
              onClick={onCancel}
            >
              Cancel
            </DivineButton>
            {availableCount > 0 && (
              <DivineButton fullWidth={false} type="button" onClick={onProceed}>
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
}: {
  confirmation: BookingConfirmation;
  paymentModes: PaymentMode[];
  onNewTransaction: () => void;
  onPaymentRecorded: (result: RecordPaymentResult) => void;
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

  async function submitPayAgain() {
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

    setSubmitting(true);
    try {
      const r = await api.post<ApiEnvelope<RecordPaymentResult>>(
        `/pos/booking/bookings/${confirmation._id}/payments`,
        { amount, paymentModeId: modeId },
      );
      const result = unwrap(r);
      onPaymentRecorded(result);
      if (result.balanceAmount > 0.005) {
        setPaymentPopup(result);
        setAmountInput(result.balanceAmount.toFixed(2));
      } else {
        setPaymentPopup(null);
        setPayAgainOpen(false);
        setGrandOpen(true);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    {stillDue && (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8">
      <motion.div
        initial={{ opacity: 0, y: "80%", rotateX: 55, scale: 0.86 }}
        animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 20 }}
        style={{ transformOrigin: "50% 120%" }}
        className={`mx-auto w-full max-w-lg rounded-2xl p-6 text-center sm:p-8 ${
          stillDue
            ? "border border-gold-500/20 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.2)]"
            : "border-2 border-gold-400 bg-gradient-to-b from-[#fff8e0] via-white to-[#ffe8b5] shadow-[0_28px_70px_-18px_rgba(212,175,55,0.55)]"
        }`}
      >
        <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 ${stillDue ? "border-emerald-500/40 bg-emerald-500/10" : "border-gold-400 bg-gold-500/20"}`}>
          <svg
            className={`h-8 w-8 ${stillDue ? "text-emerald-500" : "text-amber-600"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className={`font-display font-bold text-ink-100 ${stillDue ? "text-[24px]" : "pos-gold-title text-[28px]"}`}>
          {stillDue ? "Partial Payment Success" : "Booking Success"}
        </h2>
        <p className="mt-1 text-[13px] text-ink-500">
          {stillDue ? "Partial payment received · Inventory updated" : "Payment received · Inventory updated"}
        </p>
        {stillDue && (
          <StayOnPageWarning>
            Do not close or refresh this page until the remaining balance is collected. Leaving now will interrupt payment collection.
          </StayOnPageWarning>
        )}
        <div className="my-6 space-y-2 rounded-xl border border-gold-500/15 bg-ivory-100 px-5 py-4 text-left text-[13px]">
          <Row
            label="Booking No."
            value={confirmation.bookingNumber}
            highlight
          />
          <Row label="Order No." value={confirmation.orderNumber} />
          <Row label="Receipt No." value={confirmation.receiptNo ?? "—"} />
          <Row
            label="Customer"
            value={`${confirmation.customer.name} (${confirmation.customer.customerCode})`}
          />
          <Row label="Payment Mode" value={confirmation.paymentModeName} />
          <div className="border-t border-gold-500/10 pt-2">
            <Row
              label={
                <span className="flex items-center gap-1.5">
                  Total Payable Amount
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                    GST Inclusive
                  </span>
                </span>
              }
              value={formatCurrency(confirmation.grandTotal)}
            />
            <Row label="Amount Paid" value={formatCurrency(confirmation.amountPaid)} />
            <Row label="Balance Due" value={formatCurrency(confirmation.balanceAmount)} highlight={confirmation.balanceAmount > 0} />
          </div>
        </div>

        {stillDue && !payAgainOpen && (
          <div className="mb-4 space-y-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-4 py-3 text-left">
            <p className="text-[12px] text-crimson-500">
              Only partially paid — {formatCurrency(confirmation.balanceAmount)} still due. Collect the remaining
              amount now. The booking is confirmed only after full payment.
            </p>
            <DivineButton fullWidth type="button" onClick={openPayAgain}>
              Pay Again
            </DivineButton>
          </div>
        )}

        {payAgainOpen && stillDue && (
          <div className="mb-4 space-y-3 rounded-lg border border-gold-500/20 bg-ivory-50 px-4 py-3.5 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              Collect Remaining Payment
            </p>
            <DivineInput
              label={`Amount (max ${formatCurrency(confirmation.balanceAmount)})`}
              type="number"
              min={0.01}
              max={confirmation.balanceAmount}
              step="0.01"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            <PaymentModeBoxes modes={paymentModes} value={modeId} onChange={setModeId} />
            <DivineButton fullWidth type="button" loading={submitting} onClick={submitPayAgain}>
              Collect Payment
            </DivineButton>
          </div>
        )}
      </motion.div>
    </div>
    )}
    <HebInspiredSuccessModal
      open={grandOpen}
      onClose={onNewTransaction}
      title="Booking Success"
      amountLabel="Total amount paid"
      amount={formatCurrency(confirmation.amountPaid)}
      bookingNo={confirmation.bookingNumber}
      paymentMode={confirmation.paymentModeName}
      amountPaid={formatCurrency(confirmation.amountPaid)}
      cta="Continue"
    />
    <PaymentRecordedModal open={!!paymentPopup} result={paymentPopup} onClose={() => setPaymentPopup(null)} />
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
      panelClassName="w-full max-w-sm overflow-hidden rounded-2xl border border-gold-500/25 bg-white p-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
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
          <DivineButton fullWidth onClick={onClose}>
            OK
          </DivineButton>
          </>
          )}
    </PosFlipModal>
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
