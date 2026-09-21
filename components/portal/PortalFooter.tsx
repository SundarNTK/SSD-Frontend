import Link from "next/link";
import { DEFAULT_LOGO, type FooterInfo, type MenuNode, type SiteInfo } from "../../lib/portalApi";
import { FacebookIcon, InstagramIcon, YoutubeIcon } from "./PortalIcons";

/** Flattens the footer menu — a footer has no dropdowns, so a parent and its children are all just links. */
function footerLinks(menus: MenuNode[]): MenuNode[] {
  return menus.flatMap((m) => [...(m.href ? [m] : []), ...m.children]);
}

/**
 * Footer, driven entirely by the CMS: the links come from the CMS Menu master
 * (location: Footer); the logo, address, phone, e-mail and social links from the
 * Site Footer page's Site Details section; and every piece of wording — the
 * about text, column headings, opening hours, note and copyright — from its
 * Footer section.
 */
export default function PortalFooter({ menus, site, info }: { menus: MenuNode[]; site: SiteInfo; info: FooterInfo }) {
  const links = footerLinks(menus);
  const socials = [
    { label: "Facebook", href: site.facebook, icon: <FacebookIcon /> },
    { label: "Instagram", href: site.instagram, icon: <InstagramIcon /> },
    { label: "YouTube", href: site.youtube, icon: <YoutubeIcon /> },
  ].filter((s) => s.href);

  return (
    <footer className="relative overflow-hidden bg-[#5b1020] text-[#f0dcc0]">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-gold-500 to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          {/* The full logo has red lettering, so it sits on a cream plate. */}
          <div className="inline-block rounded-2xl bg-[#fff8e8] px-4 py-2 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.6)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.logo || DEFAULT_LOGO} alt="Sri Siva Durga Temple" className="h-14 w-auto object-contain" />
          </div>
          {info.about && <p className="mt-4 max-w-xs text-[13.5px] leading-6 text-[#f0dcc0]/85">{info.about}</p>}
          <div className="mt-5 space-y-1 text-[13.5px] text-[#f0dcc0]/85">
            {site.address && <p>{site.address}</p>}
            {site.phone && <p>{site.phone}</p>}
            {site.email && <p>{site.email}</p>}
          </div>
          {socials.length > 0 && (
            <div className="mt-5 flex gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition hover:-translate-y-0.5 hover:bg-gold-500 hover:text-[#5b1020]"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-portal text-[18px] font-bold text-gold-300">{info.linksTitle}</h3>
          <ul className="mt-4 space-y-2.5 text-[13.5px]">
            {links.map((l) => (
              <li key={l.id}>
                {l.href?.startsWith("/") ? (
                  <Link href={l.href} className="transition hover:text-white hover:underline">
                    {l.name}
                  </Link>
                ) : (
                  <a href={l.href ?? "#"} target={l.openInNewTab ? "_blank" : undefined} rel="noopener noreferrer" className="transition hover:text-white hover:underline">
                    {l.name}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-portal text-[18px] font-bold text-gold-300">{info.hoursTitle}</h3>
          {info.hours.length > 0 ? (
            <dl className="mt-4 space-y-1.5 text-[13.5px]">
              {info.hours.map((row, i) => (
                <div key={i} className="flex flex-wrap gap-x-2">
                  {row.days && <dt className="font-medium text-white">{row.days}</dt>}
                  <dd>{row.time}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-[13.5px]">Please contact the temple office.</p>
          )}
          {info.hoursNote && <p className="mt-2 text-[13px] text-[#f0dcc0]/70">{info.hoursNote}</p>}
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-[12px] text-[#f0dcc0]/70">
          {info.copyright.replaceAll("{year}", String(new Date().getFullYear()))}
        </p>
      </div>
    </footer>
  );
}
