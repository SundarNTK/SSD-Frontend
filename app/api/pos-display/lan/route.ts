import { networkInterfaces } from "os";
import { NextRequest, NextResponse } from "next/server";

function lanIPv4() {
  const ips: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      // Compared as a string on both sides — @types/node types `family` as
      // "IPv4" | "IPv6" only, but Node itself returned the numeric legacy
      // constants (4/6) before v18, so this stays defensive against both at
      // runtime without a cast TS would flag as a same-type comparison.
      const family = String(addr.family);
      const v4 = family === "IPv4" || family === "4";
      if (v4 && !addr.internal) ips.push(addr.address);
    }
  }
  ips.sort((a, b) => rank(a) - rank(b));
  return ips;
}

function rank(ip: string) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (ip.startsWith("172.")) return 2;
  return 3;
}

/**
 * LAN origins the customer tablet/phone should open — but ONLY meaningful
 * for local dev (`next dev` on a counter PC's own machine), where
 * `os.networkInterfaces()` genuinely reflects that PC's Wi-Fi adapter.
 *
 * In any real deployment (Vercel or otherwise) this process isn't running
 * on the counter PC at all — it's in the host's own data center — so those
 * interfaces belong to a cloud container, not the shop's network. Returning
 * them there wouldn't just be unhelpful, it could hand out an unreachable
 * (or wrong) address instead of the one that actually works: the public
 * origin every device already reaches over ordinary Wi-Fi/internet, no LAN
 * traversal or firewall rule required. So in production this always
 * answers with no IPs, and the frontend (useLanDisplayOrigin) falls back
 * to that public origin — see PosCustomerDisplayPage.tsx.
 */
export async function GET(req: NextRequest) {
  const hostHeader = req.headers.get("host") || "localhost:3000";
  const portFromHost = hostHeader.includes("]")
    ? hostHeader.split("]:")[1]
    : hostHeader.split(":")[1];
  const port = portFromHost || req.nextUrl.port || "3000";
  const proto = req.nextUrl.protocol.replace(":", "") || "http";
  const ips = process.env.NODE_ENV === "production" ? [] : lanIPv4();
  const origins = ips.map((ip) => `${proto}://${ip}:${port}`);

  return NextResponse.json({
    success: true,
    data: {
      ips,
      port,
      origins,
      primaryOrigin: origins[0] || null,
    },
  });
}
