export function MailIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 6.5h17a1 1 0 011 1v9a1 1 0 01-1 1h-17a1 1 0 01-1-1v-9a1 1 0 011-1z" />
      <path d="M3 7l9 6.5L21 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 118 0v3" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4.5 4.5h4l1.7 4.3-2.1 1.7a12 12 0 005.9 5.9l1.7-2.1 4.3 1.7v4a1 1 0 01-1.1 1A16.5 16.5 0 013.5 5.6a1 1 0 011-1.1z" />
    </svg>
  );
}

export function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 5.2A10.9 10.9 0 0112 5c5 0 9 4 10.5 7-.6 1.2-1.5 2.5-2.7 3.6M6.6 6.6C4.6 8 3.1 9.9 1.5 12 3 15 7 19 12 19a10.7 10.7 0 004.4-.9" strokeLinecap="round" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 19.5c1.4-3.5 4.3-5.5 7.5-5.5s6.1 2 7.5 5.5" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3" />
      <path d="M2.8 19c1.2-3.2 3.6-5 6.2-5s5 1.8 6.2 5" strokeLinecap="round" />
      <path d="M15.5 5.3a3 3 0 010 5.7M18.2 19c-.5-2-1.6-3.6-3-4.6" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ className = "h-[16px] w-[16px]" }: { className?: string } = {}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2M6.5 7l.8 12a2 2 0 002 1.8h5.4a2 2 0 002-1.8l.8-12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" strokeLinecap="round" />
    </svg>
  );
}

export function PencilIcon({ className = "h-[16px] w-[16px]" }: { className?: string } = {}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14.5 4.5l5 5L8 21H3v-5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 6.5l5 5" strokeLinecap="round" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3.5l7 3v5.2c0 4.6-3 8.2-7 9.3-4-1.1-7-4.7-7-9.3V6.5l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 4h2l2.4 12.2a2 2 0 002 1.8h7.8a2 2 0 002-1.7L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20.5" r="1.3" />
      <circle cx="17" cy="20.5" r="1.3" />
    </svg>
  );
}

export function BoxIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 8l8.5-4.5L20.5 8v8L12 20.5 3.5 16V8z" strokeLinejoin="round" />
      <path d="M3.5 8L12 12.5 20.5 8M12 12.5V20.5" strokeLinejoin="round" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9 4.5H6a1.5 1.5 0 00-1.5 1.5v12A1.5 1.5 0 006 19.5h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 8l4 4-4 4M18.3 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 11.5L12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9.5h12V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function HistoryIcon() {
  return (
    <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 7v5.5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 9.5A8 8 0 1112 20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 5.5v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PrinterIcon() {
  return (
    <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6.5 9V4.5h11V9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 18h-2A1.5 1.5 0 013 16.5v-5A1.5 1.5 0 014.5 10h15a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5h-2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 14h11v5.5h-11V14z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5.2 7.5a.75.75 0 011.06.02L10 11.293l3.74-3.773a.75.75 0 111.08 1.04l-4.25 4.286a.75.75 0 01-1.08 0L5.18 8.56a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.6 3.6 6.7-6.7a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
