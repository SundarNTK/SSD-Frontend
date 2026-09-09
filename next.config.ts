import type { NextConfig } from "next";
import { networkInterfaces } from "os";

function lanDevOrigins() {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      // Compared as a string on both sides — see the matching comment in
      // app/api/pos-display/lan/route.ts for why.
      const family = String(addr.family);
      const v4 = family === "IPv4" || family === "4";
      if (v4 && !addr.internal) hosts.add(addr.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  // Phone/tablet on Wi-Fi hits this PC by LAN IP. Next's dev server otherwise
  // treats that host as a foreign origin and blocks /_next assets.
  allowedDevOrigins: lanDevOrigins(),
};

export default nextConfig;
