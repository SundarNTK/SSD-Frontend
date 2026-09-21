import Link from "next/link";

export default function PortalNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-[13px] font-semibold uppercase tracking-[0.26em] text-amber-700">404</p>
      <h1 className="mt-2 font-portal text-[40px] font-bold text-maroon">Page not found</h1>
      <p className="mt-3 text-[14.5px] text-ink-500">The page you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
      <Link href="/customer" className="mt-6 inline-flex rounded-lg bg-maroon px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-maroon-hover">
        Back to home
      </Link>
    </div>
  );
}
