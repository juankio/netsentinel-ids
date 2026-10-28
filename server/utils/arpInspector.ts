import { readFileSync } from 'node:fs'
import os from 'node:os'
import type { ArpEntry, IdsAlert, ScenarioMode } from '../../types/network'

const OUI_VENDOR_MAP: Record<string, string> = {
  'dc:08:da': 'Tu Router de Internet (Gateway Principal)',
  '10:da:63': 'Dispositivo en tu Casa (Móvil / PC en LAN)',
  '00:1a:2b': 'Cisco Systems (Enterprise Switch)',
  '00:50:56': 'VMware Inc. (Virtual NIC)',
  '3c:52:82': 'Hewlett Packard Enterprise',
  'bc:24:11': 'Proxmox / QEMU Virtual NIC',
  'f8:75:a4': 'Intel Corporate Wireless',
  'a4:bb:6d': 'Dell Inc. Client NIC',
  'e4:5f:01': 'Raspberry Pi Trading Ltd',
  '24:0a:c4': 'Espressif Inc. (IoT Node)',
  'b0:be:76': 'TP-Link Technologies',
  '3c:22:fb': 'Apple Inc.',
  '00:e0:4c': 'Realtek Semiconductor Corp.'
}

export function decodeHexIpv4(hex: string): string {
  const clean = hex.trim()
  if (!/^[0-9a-fA-F]{8}$/.test(clean)) return '0.0.0.0'
  const b0 = Number.parseInt(clean.slice(6, 8), 16)
  const b1 = Number.parseInt(clean.slice(4, 6), 16)
  const b2 = Number.parseInt(clean.slice(2, 4), 16)
  const b3 = Number.parseInt(clean.slice(0, 2), 16)
  return `${b0}.${b1}.${b2}.${b3}`
}

export function lookupMacVendor(
  macAddress: string,
  ipAddress?: string,
  defaultGatewayIp?: string
): string {
  const normalized = macAddress.toLowerCase().trim()
  const prefix = normalized.slice(0, 8)
  if (
    (ipAddress && defaultGatewayIp && ipAddress === defaultGatewayIp) ||
    prefix === 'dc:08:da'
  ) {
    return 'Tu Router de Internet (Gateway Principal)'
  }
  if (prefix === '10:da:63') {
    return 'Dispositivo en tu Casa (Móvil / PC en LAN)'
  }
  if (OUI_VENDOR_MAP[prefix]) {
    return OUI_VENDOR_MAP[prefix]
  }
  return `Dispositivo en tu Casa (OUI ${prefix.toUpperCase()})`
}

export function readDefaultGatewayFromRoute(): {
  gatewayIp: string
  interfaces: string[]
} {
  try {
    const raw = readFileSync('/proc/net/route', 'utf-8')
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const candidates: Array<{ iface: string; gatewayIp: string; metric: number }> = []
    for (const line of lines.slice(1)) {
      const cols = line.split(/\s+/)
      if (cols.length < 8) continue
      const iface = cols[0]
      const destination = cols[1]
      const gatewayHex = cols[2]
      const metric = Number.parseInt(cols[6] ?? '999', 10)

      if (destination === '00000000' && gatewayHex && gatewayHex !== '00000000') {
        candidates.push({
          iface,
          gatewayIp: decodeHexIpv4(gatewayHex),
          metric: Number.isNaN(metric) ? 999 : metric
        })
      }
    }

    candidates.sort((a, b) => a.metric - b.metric)
    if (candidates.length > 0) {
      return {
        gatewayIp: candidates[0].gatewayIp,
        interfaces: Array.from(new Set(candidates.map((c) => c.iface)))
      }
    }
  } catch {
    // Fallback if /proc/net/route is unreadable
  }

  return {
    gatewayIp: '192.168.1.1',
    interfaces: ['enp4s0', 'wlo1']
  }
}

interface RawSystemArpRow {
  ipAddress: string
  macAddress: string
  interfaceName: string
  flags: string
  isStatic: boolean
}

export function readSystemProcArp(): {
  rows: RawSystemArpRow[]
  interfaceSource: string
} {
  try {
    const raw = readFileSync('/proc/net/arp', 'utf-8')
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const parsedRows: RawSystemArpRow[] = []
    for (const line of lines.slice(1)) {
      const columns = line.split(/\s+/)
      if (columns.length < 6) continue

      const [ipAddress, , flags, macAddress, , interfaceName] = columns
      const normalizedMac = macAddress.toLowerCase()
      if (
        !ipAddress ||
        !normalizedMac ||
        normalizedMac === '00:00:00:00:00:00' ||
        !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(normalizedMac)
      ) {
        continue
      }

      parsedRows.push({
        ipAddress,
        macAddress: normalizedMac,
        interfaceName: interfaceName || 'enp4s0',
        flags: flags.toLowerCase(),
        isStatic: flags.toLowerCase() === '0x6'
      })
    }

    const interfaces = Array.from(new Set(parsedRows.map((row) => row.interfaceName)))
    const ifaceSummary = interfaces.length > 0 ? interfaces.join(', ') : 'kernel-net'
    return {
      rows: parsedRows,
      interfaceSource: `Linux Kernel /proc/net/arp + /proc/net/route (${ifaceSummary})`
    }
  } catch {
    return {
      rows: [],
      interfaceSource: 'Linux Kernel /proc/net/arp (unavailable)'
    }
  }
}

const initialGateway = readDefaultGatewayFromRoute()
const initialArp = readSystemProcArp()
const discoveredGatewayRow = initialArp.rows.find(
  (row) => row.ipAddress === initialGateway.gatewayIp
)

export const TRUSTED_GATEWAY_IP = initialGateway.gatewayIp
export const TRUSTED_GATEWAY_MAC =
  discoveredGatewayRow?.macAddress ?? 'dc:08:da:33:22:90'

function formatHostInterfaceVendor(ifaceName: string): string {
  if (ifaceName.startsWith('en') || ifaceName.startsWith('eth')) {
    return 'Este Equipo Linux · Cable Ethernet (' + ifaceName + ')'
  }
  if (ifaceName.startsWith('wl')) {
    return 'Este Equipo Linux · Antena Wi-Fi (' + ifaceName + ')'
  }
  return 'Este Equipo Linux (' + ifaceName + ')'
}

function readHostLocalInterfaceArpEntries(nowIso: string): ArpEntry[] {
  const netInterfaces = os.networkInterfaces()
  const hostEntries: ArpEntry[] = []
  const seenMacs = new Set<string>()

  for (const [ifaceName, addresses] of Object.entries(netInterfaces)) {
    if (!addresses) continue
    for (const addr of addresses) {
      const isIpv4 = addr.family === 'IPv4' || (addr as unknown as { family: number }).family === 4
      if (!isIpv4 || addr.internal) continue
      const normalizedMac = (addr.mac || '').toLowerCase().trim()
      if (
        !normalizedMac ||
        normalizedMac === '00:00:00:00:00:00' ||
        seenMacs.has(normalizedMac)
      ) {
        continue
      }
      seenMacs.add(normalizedMac)

      hostEntries.push({
        id: `arp-host-${ifaceName}-${addr.address.replace(/\./g, '-')}`,
        ipAddress: addr.address,
        macAddress: normalizedMac,
        interfaceName: ifaceName,
        vendor: formatHostInterfaceVendor(ifaceName),
        isGateway: false,
        isStatic: true,
        status: 'trusted',
        lastSeen: nowIso
      })
    }
  }

  return hostEntries
}

export function buildScenarioArpEntries(scenario: ScenarioMode): {
  entries: ArpEntry[]
  interfaceSource: string
  trustedGatewayMac: string
} {
  const nowIso = new Date().toISOString()
  const { gatewayIp } = readDefaultGatewayFromRoute()
  const systemArp = readSystemProcArp()

  const liveGatewayMac =
    systemArp.rows.find((row) => row.ipAddress === gatewayIp)?.macAddress ??
    TRUSTED_GATEWAY_MAC

  const entries: ArpEntry[] = systemArp.rows.map((row) => {
    const isGateway = row.ipAddress === gatewayIp
    return {
      id: `arp-${row.interfaceName}-${row.ipAddress.replace(/\./g, '-')}`,
      ipAddress: row.ipAddress,
      macAddress: row.macAddress,
      interfaceName: row.interfaceName,
      vendor: lookupMacVendor(row.macAddress, row.ipAddress, gatewayIp),
      isGateway,
      isStatic: row.isStatic,
      status: 'trusted',
      lastSeen: nowIso
    }
  })

  const hostEntries = readHostLocalInterfaceArpEntries(nowIso)
  for (const hostEntry of hostEntries) {
    const duplicate = entries.some(
      (e) =>
        e.interfaceName === hostEntry.interfaceName &&
        e.ipAddress === hostEntry.ipAddress
    )
    if (!duplicate) {
      entries.push(hostEntry)
    }
  }

  if (scenario === 'arp_spoof_detected') {
    const primaryIface = entries[0]?.interfaceName ?? 'enp4s0'
    const subnetPrefix = gatewayIp.split('.').slice(0, 3).join('.') || '192.168.1'
    entries.push({
      id: `arp-${primaryIface}-${subnetPrefix}-250`,
      ipAddress: `${subnetPrefix}.250`,
      macAddress: liveGatewayMac,
      interfaceName: primaryIface,
      vendor: 'Nodo Intruso Detectado (Colisión MAC con Gateway)',
      isGateway: false,
      isStatic: false,
      status: 'collision',
      lastSeen: nowIso
    })
  }

  return {
    entries,
    interfaceSource: systemArp.interfaceSource,
    trustedGatewayMac: liveGatewayMac
  }
}

export function detectArpAnomalies(
  entries: ArpEntry[],
  trustedGatewayMac: string = TRUSTED_GATEWAY_MAC
): {
  annotatedEntries: ArpEntry[]
  alerts: IdsAlert[]
  arpIntegrityScore: number
  activeCollisions: number
} {
  const nowIso = new Date().toISOString()
  const normalizedTrustedGwMac = trustedGatewayMac.toLowerCase().trim()

  const macToIps = new Map<string, Set<string>>()
  for (const entry of entries) {
    const mac = entry.macAddress.toLowerCase().trim()
    const ipSet = macToIps.get(mac) ?? new Set<string>()
    ipSet.add(entry.ipAddress)
    macToIps.set(mac, ipSet)
  }

  const collidingMacs = new Set<string>()
  for (const [mac, ipSet] of macToIps.entries()) {
    if (ipSet.size > 1) {
      collidingMacs.add(mac)
    }
  }

  const alerts: IdsAlert[] = []
  let hasGatewayDrift = false

  const annotatedEntries: ArpEntry[] = entries.map((entry) => {
    const normalizedMac = entry.macAddress.toLowerCase().trim()
    const isCollision = collidingMacs.has(normalizedMac)
    const isDrift =
      entry.isGateway && normalizedMac !== normalizedTrustedGwMac

    if (isDrift) {
      hasGatewayDrift = true
    }

    let status: ArpEntry['status'] = 'trusted'
    if (isCollision) {
      status = 'collision'
    } else if (isDrift || entry.status === 'gateway_drift') {
      status = 'gateway_drift'
      hasGatewayDrift = true
    }

    return {
      ...entry,
      macAddress: normalizedMac,
      status
    }
  })

  for (const collidingMac of collidingMacs) {
    const matchingEntries = annotatedEntries.filter(
      (entry) => entry.macAddress === collidingMac
    )
    const gatewayEntry = matchingEntries.find((entry) => entry.isGateway)
    const impersonatorEntries = matchingEntries.filter((entry) => !entry.isGateway)
    const primarySuspect = impersonatorEntries[0] ?? matchingEntries[matchingEntries.length - 1]
    const allIps = matchingEntries.map((entry) => entry.ipAddress).join(', ')

    alerts.push({
      id: `alert-arp-collision-${collidingMac.replace(/:/g, '')}`,
      timestamp: nowIso,
      severity: 'critical',
      category: 'ARP_SPOOFING',
      title: 'Colisión de Dirección Física MAC (Indicador ARP Spoofing)',
      description: gatewayEntry
        ? `El host ${primarySuspect.ipAddress} anuncia la misma dirección MAC (${collidingMac}) que el gateway predeterminado (${gatewayEntry.ipAddress}). Posible intercepción MITM en Capa 2.`
        : `Múltiples direcciones IP (${allIps}) reclaman simultáneamente la dirección física MAC ${collidingMac} en el segmento local.`,
      sourceIp: primarySuspect.ipAddress,
      affectedMac: collidingMac,
      mitigationId: 'rem-dai',
      acknowledged: false
    })
  }

  const gatewayEntries = annotatedEntries.filter(
    (entry) =>
      (entry.isGateway && entry.macAddress !== normalizedTrustedGwMac) ||
      entry.status === 'gateway_drift'
  )

  for (const gwEntry of gatewayEntries) {
    alerts.push({
      id: `alert-gw-drift-${gwEntry.ipAddress.replace(/\./g, '-')}`,
      timestamp: nowIso,
      severity: 'high',
      category: 'GATEWAY_DRIFT',
      title: 'Desviación de Identidad MAC en Gateway (Gateway Drift)',
      description: `El gateway ${gwEntry.ipAddress} presenta la MAC ${gwEntry.macAddress}, la cual difiere del OUI certificado en la línea base (${normalizedTrustedGwMac}).`,
      sourceIp: gwEntry.ipAddress,
      affectedMac: gwEntry.macAddress,
      mitigationId: 'rem-static-arp',
      acknowledged: false
    })
  }

  const activeCollisions = collidingMacs.size
  let arpIntegrityScore = 100
  if (activeCollisions > 0) {
    arpIntegrityScore -= activeCollisions * 45
  }
  if (hasGatewayDrift) {
    arpIntegrityScore -= 25
  }
  arpIntegrityScore = Math.max(0, Math.min(100, arpIntegrityScore))

  return {
    annotatedEntries,
    alerts,
    arpIntegrityScore,
    activeCollisions
  }
}
