import net from 'net';
import os from 'os';

export interface Found {
  host: string; port: number;
  version?: string;          // MySQL greeting, e.g. "5.5.62"
  blocked?: string;          // MySQL answered but refuses this device
}

/** Reads MySQL's first packet, which the server sends before any login, so no credentials are needed. */
export function probe(host: string, port: number, timeoutMs: number): Promise<Found | null> {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port });
    let done = false;
    const finish = (r: Found | null) => { if (!done) { done = true; s.destroy(); resolve(r); } };
    s.setTimeout(timeoutMs, () => finish(null));
    s.on('error', () => finish(null));
    s.once('data', (buf) => {
      if (buf.length < 6) return finish(null);
      const proto = buf[4];
      if (proto === 0x0a) {                               // normal greeting: version string follows
        const end = buf.indexOf(0, 5);
        return finish({ host, port, version: buf.toString('latin1', 5, end > 0 ? end : undefined) });
      }
      if (proto === 0xff) {                               // error packet, e.g. "Host is not allowed"
        return finish({ host, port, blocked: buf.toString('latin1', 7).replace(/[^\x20-\x7e]/g, '').replace(/^#\w{5}/, '').trim() });
      }
      finish(null);
    });
  });
}

/** IPv4 addresses of this device's own network interfaces (Wi-Fi, Ethernet, USB network). */
export function localAddresses() {
  const out: { iface: string; address: string; netmask: string }[] = [];
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ iface, address: a.address, netmask: a.netmask });
  }
  return out;
}

const toInt = (ip: string) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const toIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

/** Scans the subnets this device is on (at most a /24 each) for MySQL servers on `port`. */
export async function discoverMysql(port = 3306): Promise<{ found: Found[]; scanned: number }> {
  const hosts = new Set<string>();
  for (const a of localAddresses()) {
    const ip = toInt(a.address);
    const mask = toInt(a.netmask) >>> 0;
    const bits = 32 - Math.clz32(~mask >>> 0 || 0) ;            // host bits
    const hostBits = Math.min(bits, 8);                          // never scan more than 254 hosts per interface
    const base = hostBits === 8 ? (ip & 0xffffff00) >>> 0 : (ip & mask) >>> 0;
    const count = (1 << hostBits) - 2;
    for (let i = 1; i <= count; i++) { const h = toIp(base + i); if (h !== a.address) hosts.add(h); }
  }
  const list = [...hosts];
  const found: Found[] = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const h = list[next++];
      const r = await probe(h, port, 700);
      if (r) found.push(r);
    }
  };
  await Promise.all(Array.from({ length: 64 }, worker));
  return { found, scanned: list.length };
}
