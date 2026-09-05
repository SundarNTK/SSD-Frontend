"use client";

/**
 * Visual preview of what a physical thermal ticket looks like after
 * printing — for reviewing the layout without a printer/NETS terminal on
 * hand. Mirrors, section-for-section, the actual print template built by
 * SSD Nets-Service's amq/printService.js#buildReceipt() and
 * amq/ssdTicketBuilder.js: logo, temple name (Tamil + English), receipt/
 * GST/date line, ticket heading (deity or print group), itemized lines
 * (English + Tamil name, qty, total), a shared "Name - Star" devotee
 * block, payment method, then the cut line. Not a pixel-perfect thermal
 * render (that's ESC/POS raster bytes, not HTML) — a layout/content proof,
 * same purpose as loader-preview serves for the loading animations.
 */

const LOGO = "/SSD_Full_Logo.webp";

type TicketLine = { name: string; tamilName: string; quantity: number; total: string };
type Devotee = { name: string; nakshatra: string };

type SampleTicket = {
  label: string;
  ticketHeading: string;
  ticketHeadingTamil: string;
  items: TicketLine[];
  devotees: Devotee[];
  paymentMethod: string;
};

const RECEIPT_NO = "RCP-20260908-0001";
const GST_NO = "M881003771";
const DATE_LINE = "08/09/2026 03:35PM";

const MURUGAN: TicketLine = { name: "Archana Murugan", tamilName: "அர்ச்சனை முருகன்", quantity: 1, total: "10.00" };
const DURGA: TicketLine = { name: "Archana Durga", tamilName: "அர்ச்சனை துர்கா", quantity: 1, total: "10.00" };
const VINAYAGAR: TicketLine = { name: "Archana Vinayagar", tamilName: "அர்ச்சனை விநாயகர்", quantity: 1, total: "5.00" };
const DEVOTEE: Devotee = { name: "Sundar", nakshatra: "Rohini" };

const SCENARIOS: { title: string; note: string; tickets: SampleTicket[] }[] = [
  {
    title: "Print Group Wise — 2 tickets",
    note: "Murugan and Durga are both mapped to Print Group A, so they combine onto one ticket. Vinayagar is alone in Print Group B.",
    tickets: [
      {
        label: "Ticket 1 of 2 — Print Group A",
        ticketHeading: "Print Group A",
        ticketHeadingTamil: "",
        items: [MURUGAN, DURGA],
        devotees: [DEVOTEE],
        paymentMethod: "NETS",
      },
      {
        label: "Ticket 2 of 2 — Print Group B",
        ticketHeading: "Print Group B",
        ticketHeadingTamil: "",
        items: [VINAYAGAR],
        devotees: [DEVOTEE],
        paymentMethod: "NETS",
      },
    ],
  },
  {
    title: "Deity Wise — 3 tickets",
    note: "The same booking, with the Print Split Setting switched to Deity Wise: one ticket per deity, regardless of Print Group.",
    tickets: [
      { label: "Ticket 1 of 3", ticketHeading: "Murugan", ticketHeadingTamil: "முருகன்", items: [MURUGAN], devotees: [DEVOTEE], paymentMethod: "NETS" },
      { label: "Ticket 2 of 3", ticketHeading: "Vinayagar", ticketHeadingTamil: "விநாயகர்", items: [VINAYAGAR], devotees: [DEVOTEE], paymentMethod: "NETS" },
      { label: "Ticket 3 of 3", ticketHeading: "Durga", ticketHeadingTamil: "துர்கா", items: [DURGA], devotees: [DEVOTEE], paymentMethod: "NETS" },
    ],
  },
];

function TicketPaper({ ticket }: { ticket: SampleTicket }) {
  return (
    <div className="w-[320px] shrink-0 bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)]">
      <img src={LOGO} alt="Sri Siva Durga Temple" className="mx-auto mb-2 h-auto w-full max-w-[220px] object-contain" />

      <p className="text-center text-[14px] font-bold leading-tight">ஸ்ரீ சிவ துர்க்கா ஆலயம்</p>
      <p className="text-center text-[13px] font-bold leading-tight">Sri Siva Durga Temple</p>

      <div className="my-2 border-t border-dashed border-black" />

      <p>Receipt no.: {RECEIPT_NO}</p>
      <p>GST no.: {GST_NO}</p>
      <p>Date: {DATE_LINE}</p>

      <div className="my-2 border-t border-dashed border-black" />

      {(ticket.ticketHeadingTamil || ticket.ticketHeading) && (
        <>
          {ticket.ticketHeadingTamil && <p className="text-center text-[13px] font-bold">{ticket.ticketHeadingTamil}</p>}
          <p className="text-center text-[13px] font-bold">{ticket.ticketHeading}</p>
        </>
      )}

      <div className="my-2 space-y-2 text-center">
        {ticket.items.map((item, i) => (
          <div key={i}>
            <p className="text-[12.5px]">{item.tamilName}</p>
            <p>{item.name}</p>
            <p className="font-bold">Qty: {item.quantity}</p>
            <p className="font-bold">${item.total}(GST Inclusive)</p>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      {ticket.devotees.length > 0 && (
        <>
          <p className="text-center font-bold">Name - Star</p>
          <div className="my-1 border-t border-dashed border-black" />
          {ticket.devotees.map((d, i) => (
            <p key={i} className="text-left">
              {d.name} — {d.nakshatra}
            </p>
          ))}
          <div className="my-2 border-t border-dashed border-black" />
        </>
      )}

      <p className="text-center">Payment: {ticket.paymentMethod}</p>

      <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400">
        <span className="h-px flex-1 bg-gray-300" />
        <span>✂ cut here</span>
        <span className="h-px flex-1 bg-gray-300" />
      </div>
    </div>
  );
}

export default function TicketPreviewPage() {
  return (
    <div className="min-h-screen bg-[#140a06] px-4 py-8 text-[#fff8e8] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f5a623]">Sample gallery</p>
        <h1 className="mt-1 font-display text-[32px] font-bold text-[#ffe082]">Ticket Preview</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-[#e8d5a8]/85">
          A layout proof for what the physical 80mm thermal ticket looks like — every section here (logo, temple
          name, receipt/GST/date, ticket heading, item lines, devotee block, payment method, cut line) mirrors
          SSD Nets-Service&apos;s real print template (<code className="rounded bg-white/10 px-1">amq/printService.js</code>
          &apos;s <code className="rounded bg-white/10 px-1">buildReceipt()</code>). This is HTML standing in for
          thermal paper, not a pixel-identical render — actual printing sends raw ESC/POS bytes, not a rendered
          webpage. Same example booking (Murugan + Vinayagar + Durga Archana) shown under both Print Split Setting
          modes below.
        </p>

        {SCENARIOS.map((scenario) => (
          <section key={scenario.title} className="mt-10">
            <h2 className="font-display text-[20px] font-bold text-[#ffd54a]">{scenario.title}</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#e8d5a8]/70">{scenario.note}</p>
            <div className="mt-5 flex flex-wrap gap-8">
              {scenario.tickets.map((ticket) => (
                <div key={ticket.label} className="flex flex-col items-center gap-3">
                  <TicketPaper ticket={ticket} />
                  <p className="text-[12px] font-semibold text-[#ffd54a]">{ticket.label}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
