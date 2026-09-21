"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BannerSlide } from "../../lib/portalApi";
import { ArrowRightIcon } from "./PortalIcons";

const INTERVAL_MS = 6500;

type Props = {
  slides: BannerSlide[];
  /** Read by screen readers and search engines. */
  headline: string;
};

const isSitePath = (href: string) => href.startsWith("/") || href.startsWith("#");

/** Wraps the picture in a link only when the slide has one. */
function MaybeLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  const cls = "relative block h-full w-full cursor-pointer";
  return isSitePath(href) ? (
    <Link href={href} className={cls} aria-label={label || "Open banner link"}>
      {children}
    </Link>
  ) : (
    <a href={href} className={cls} aria-label={label || "Open banner link"} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * The portal's banner: a plain image slider. The images (up to five) are
 * uploaded in the CMS — Home page -> Banner section — and have nothing to do
 * with events or any other master.
 *
 * Each image is shown COMPLETE, never cropped: the frame is a wide banner ratio
 * and the picture is fitted inside it, with any leftover space filled by a
 * blurred copy of the same picture rather than bars. Nothing is written over
 * the artwork, since banners normally carry their own lettering. A slide can
 * optionally be made clickable by giving it a link in the CMS. Auto-advances,
 * pauses on hover, and can be stepped with the arrows or dots.
 */
export default function BannerSlider({ slides, headline }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, count, index]);

  if (count === 0) return null;
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);
  const slide = slides[index];
  const alt = slide.alt || `Banner ${index + 1}`;

  return (
    <section
      className="relative overflow-hidden bg-[#120306]"
      aria-roledescription="carousel"
      aria-label="Featured banners"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <h1 className="sr-only">{headline}</h1>

      <div className="relative aspect-[16/10] max-h-[calc(100vh-110px)] min-h-[280px] w-full md:aspect-[8/3] md:max-h-[540px] md:min-h-[340px]">
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.9 }, scale: { duration: 7, ease: "easeOut" } }}
            className="absolute inset-0"
          >
            {/* Soft blurred copy fills any space the fitted artwork leaves. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.image} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />
            <MaybeLink href={slide.link} label={alt}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slide.image} alt={alt} className="relative h-full w-full object-contain" />
            </MaybeLink>
          </motion.div>
        </AnimatePresence>

        {count > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Previous banner" className="absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/30 text-white backdrop-blur-md transition hover:scale-110 hover:bg-black/55 sm:flex">
              <ArrowRightIcon className="h-4 w-4 rotate-180" />
            </button>
            <button onClick={() => go(1)} aria-label="Next banner" className="absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/30 text-white backdrop-blur-md transition hover:scale-110 hover:bg-black/55 sm:flex">
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto flex max-w-6xl items-center justify-between px-5 sm:px-8">
              <span className="font-portal text-[14px] font-semibold tabular-nums text-white/90 drop-shadow">
                {String(index + 1).padStart(2, "0")} <span className="text-white/60">/ {String(count).padStart(2, "0")}</span>
              </span>
              <div className="pointer-events-auto flex items-center gap-2">
                {slides.map((_, i) => (
                  <button key={i} onClick={() => setIndex(i)} aria-label={`Show banner ${i + 1}`} aria-current={i === index} className="relative h-2 overflow-hidden rounded-full bg-white/40 transition-all duration-300" style={{ width: i === index ? 40 : 9 }}>
                    {i === index && (
                      <motion.span key={`${index}-${paused}`} initial={{ scaleX: paused ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: paused ? 0 : INTERVAL_MS / 1000, ease: "linear" }} className="absolute inset-0 origin-left bg-gold-300" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* The wavy edge sits BELOW the banner, so it never covers the artwork. */}
      <svg className="block h-8 w-full sm:h-12" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 60V32C180 4 360 0 540 20S900 62 1080 40 1300 6 1440 26V60Z" fill="#fbf6ea" />
      </svg>
    </section>
  );
}
