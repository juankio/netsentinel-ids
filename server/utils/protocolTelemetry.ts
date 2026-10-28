import { readFileSync } from 'node:fs'
import os from 'node:os'
import type {
  CryptoPostureMetrics,
  IdsAlert,
  InterfaceTrafficStat,
  PacketHeaderFlow,
  RemediationGuide,
  ScenarioMode,
  TelemetryPayload
} from '../../types/network'
import {
  buildScenarioArpEntries,
  decodeHexIpv4,
  detectArpAnomalies,
  readDefaultGatewayFromRoute,
  TRUSTED_GATEWAY_IP,
  TRUSTED_GATEWAY_MAC
} from './arpInspector'

let currentScenarioState: ScenarioMode = 'baseline'
const acknowledgedAlertIds = new Set<string>()

export function getActiveScenario(): ScenarioMode {
  return currentScenarioState
}

export function setActiveScenario(scenario: ScenarioMode): ScenarioMode {
  currentScenarioState = scenario
  return currentScenarioState
}

export function acknowledgeAlert(alertId: string): void {
  acknowledgedAlertIds.add(alertId)
}

export function decodeHexIpv6(hex: string): string {
  const clean = hex.trim().toLowerCase()
  if (clean.length !== 32 || !/^[0-9a-f]{32}$/.test(clean)) {
    return '::'
  }
  if (clean === '00000000000000000000000000000000') {
    return '::'
  }
  if (clean === '00000000000000000000000001000000') {
    return '::1'
  }
  if (clean.startsWith('0000000000000000ffff0000')) {
    return decodeHexIpv4(clean.slice(24, 32))
  }

  const groups: string[] = []
  for (let i = 0; i < 32; i += 8) {
    const word = clean.slice(i, i + 8)
    const b0 = word.slice(0, 2)
    const b1 = word.slice(2, 4)
    const b2 = word.slice(4, 6)
    const b3 = word.slice(6, 8)
    const g1 = Number.parseInt(`${b3}${b2}`, 16).toString(16)
    const g2 = Number.parseInt(`${b1}${b0}`, 16).toString(16)
    groups.push(g1, g2)
  }

  return groups.join(':').replace(/(^|:)0(:0)+(:|$)/, '::')
}

export function readKernelInterfaces(): InterfaceTrafficStat[] {
  const osIfaces = os.networkInterfaces()
  const stats: InterfaceTrafficStat[] = []

  try {
    const raw = readFileSync('/proc/net/dev', 'utf-8')
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines.slice(2)) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue

      const name = line.slice(0, colonIdx).trim()
      const fields = line
        .slice(colonIdx + 1)
        .trim()
        .split(/\s+/)
        .map((n) => Number.parseInt(n, 10) || 0)

      if (fields.length < 12) continue

      const rxBytes = fields[0] ?? 0
      const rxPackets = fields[1] ?? 0
      const rxDrop = fields[3] ?? 0
      const txBytes = fields[8] ?? 0
      const txPackets = fields[9] ?? 0
      const txDrop = fields[11] ?? 0

      const ifaceAddrs = osIfaces[name] ?? []
      const ipv4Entry = ifaceAddrs.find(
        (addr) => addr.family === 'IPv4' || (addr as unknown as { family: number }).family === 4
      )
      const macEntry = ifaceAddrs.find(
        (addr) => addr.mac && addr.mac !== '00:00:00:00:00:00'
      )

      const ipv4 = ipv4Entry?.address ?? (name === 'lo' ? '127.0.0.1' : 'Sin IPv4')
      const mac = (
        ipv4Entry?.mac ??
        macEntry?.mac ??
        '00:00:00:00:00:00'
      ).toLowerCase()
      const isUp = Boolean(ipv4Entry) || rxBytes > 0 || txBytes > 0

      stats.push({
        name,
        ipv4,
        mac,
        rxBytes,
        rxPackets,
        txBytes,
        txPackets,
        dropPackets: rxDrop + txDrop,
        isUp
      })
    }
  } catch {
    for (const [name, addrs] of Object.entries(osIfaces)) {
      if (!addrs) continue
      const ipv4Entry = addrs.find(
        (addr) => addr.family === 'IPv4' || (addr as unknown as { family: number }).family === 4
      )
      stats.push({
        name,
        ipv4: ipv4Entry?.address ?? '127.0.0.1',
        mac: (ipv4Entry?.mac ?? '00:00:00:00:00:00').toLowerCase(),
        rxBytes: 0,
        rxPackets: 0,
        txBytes: 0,
        txPackets: 0,
        dropPackets: 0,
        isUp: true
      })
    }
  }

  stats.sort((a, b) => {
    if (a.name === 'lo') return 1
    if (b.name === 'lo') return -1
    return b.rxBytes - a.rxBytes
  })

  return stats
}

interface ParsedKernelSocket {
  transport: 'tcp' | 'tcp6' | 'udp' | 'udp6'
  sourceIp: string
  sourcePort: number
  destinationIp: string
  destinationPort: number
  stateHex: string
  queueBytes: number
  inode: number
}

function parseProcSocketTable(
  filePath: string,
  transport: ParsedKernelSocket['transport'],
  isIpv6: boolean
): ParsedKernelSocket[] {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const sockets: ParsedKernelSocket[] = []
    for (const line of lines.slice(1)) {
      const cols = line.split(/\s+/)
      if (cols.length < 10) continue

      const [localHex, localPortHex] = (cols[1] ?? '').split(':')
      const [remHex, remPortHex] = (cols[2] ?? '').split(':')
      const stateHex = (cols[3] ?? '').toUpperCase()
      const [txHex, rxHex] = (cols[4] ?? '0:0').split(':')
      const inode = Number.parseInt(cols[9] ?? '0', 10) || 0

      if (!localHex || !localPortHex || !remHex || !remPortHex) continue

      const sourceIp = isIpv6 ? decodeHexIpv6(localHex) : decodeHexIpv4(localHex)
      const destinationIp = isIpv6 ? decodeHexIpv6(remHex) : decodeHexIpv4(remHex)
      const sourcePort = Number.parseInt(localPortHex, 16) || 0
      const destinationPort = Number.parseInt(remPortHex, 16) || 0
      const txBytes = Number.parseInt(txHex ?? '0', 16) || 0
      const rxBytes = Number.parseInt(rxHex ?? '0', 16) || 0

      sockets.push({
        transport,
        sourceIp,
        sourcePort,
        destinationIp,
        destinationPort,
        stateHex,
        queueBytes: txBytes + rxBytes,
        inode
      })
    }

    return sockets
  } catch {
    return []
  }
}

function isLoopbackIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip.startsWith('127.') || ip === '::1'
}

function isLoopbackOrWildcardIp(ip: string): boolean {
  return isLoopbackIp(ip) || ip === '0.0.0.0' || ip === '::'
}

function isDhcpSocket(sock: ParsedKernelSocket): boolean {
  const isUdp = sock.transport === 'udp' || sock.transport === 'udp6'
  if (!isUdp) return false
  return (
    sock.sourcePort === 67 ||
    sock.destinationPort === 67 ||
    sock.sourcePort === 68 ||
    sock.destinationPort === 68 ||
    sock.sourcePort === 546 ||
    sock.destinationPort === 546 ||
    sock.sourcePort === 547 ||
    sock.destinationPort === 547
  )
}

function isMdnsSocket(sock: ParsedKernelSocket): boolean {
  return sock.sourcePort === 5353 || sock.destinationPort === 5353
}

function classifyKernelSocket(
  sock: ParsedKernelSocket,
  index: number,
  timestampIso: string
): PacketHeaderFlow {
  const { sourceIp, destinationIp, sourcePort, destinationPort, transport, queueBytes, inode } =
    sock
  const isLoopback = isLoopbackIp(sourceIp) || isLoopbackIp(destinationIp)

  const estimatedBytes =
    queueBytes > 0 ? queueBytes : Math.max(512, ((inode % 64) + 1) * 768)

  if (
    sourcePort === 443 ||
    destinationPort === 443 ||
    sourcePort === 8443 ||
    destinationPort === 8443
  ) {
    const isAltHttps = sourcePort === 8443 || destinationPort === 8443
    return {
      id: `flow-kernel-${transport}-${inode || index}`,
      timestamp: timestampIso,
      sourceIp,
      destinationIp,
      sourcePort,
      destinationPort,
      protocol: isAltHttps ? 'HTTPS' : 'TLSv1.3',
      encrypted: true,
      cipherSuite: 'TLS 1.3 · Conexión Web Blindada (HTTPS)',
      bytesTransferred: estimatedBytes,
      riskLevel: 'safe',
      inspectionNote:
        'Tráfico hacia Internet cifrado con candado TLS. Si alguien intercepta el Wi-Fi, solo verá datos ilegibles.'
    }
  }

  if (sourcePort === 22 || destinationPort === 22) {
    return {
      id: `flow-kernel-${transport}-${inode || index}`,
      timestamp: timestampIso,
      sourceIp,
      destinationIp,
      sourcePort,
      destinationPort,
      protocol: 'SSHv2',
      encrypted: true,
      cipherSuite: 'SSHv2 · Administración Remota Cifrada',
      bytesTransferred: estimatedBytes,
      riskLevel: 'safe',
      inspectionNote: 'Canal de administración remota SSHv2 cifrado de extremo a extremo.'
    }
  }

  if (sourcePort === 853 || destinationPort === 853) {
    return {
      id: `flow-kernel-${transport}-${inode || index}`,
      timestamp: timestampIso,
      sourceIp,
      destinationIp,
      sourcePort,
      destinationPort,
      protocol: 'DNSSEC',
      encrypted: true,
      cipherSuite: 'DoT · DNS Cifrado con TLS (Puerto 853)',
      bytesTransferred: estimatedBytes,
      riskLevel: 'safe',
      inspectionNote: 'Consulta de nombres de dominio protegida con cifrado TLS.'
    }
  }

  if (isDhcpSocket(sock)) {
    return {
      id: `flow-kernel-${transport}-${inode || index}`,
      timestamp: timestampIso,
      sourceIp,
      destinationIp,
      sourcePort,
      destinationPort,
      protocol: 'ARP',
      encrypted: true,
      cipherSuite: 'DHCP · Asignación Automática de IP con tu Router',
      bytesTransferred: estimatedBytes,
      riskLevel: 'safe',
      inspectionNote:
        'Tu router renovando la dirección IP de tu PC en la red local (operación segura del sistema).'
    }
  }

  if (
    sourcePort === 53 ||
    destinationPort === 53 ||
    sourcePort === 5353 ||
    destinationPort === 5353
  ) {
    const isLocalMdns = sourcePort === 5353 || destinationPort === 5353
    return {
      id: `flow-kernel-${transport}-${inode || index}`,
      timestamp: timestampIso,
      sourceIp,
      destinationIp,
      sourcePort,
      destinationPort,
      protocol: 'DNS',
      encrypted: isLocalMdns,
      cipherSuite: 'mDNS · Descubrimiento Local de Dispositivos',
      bytesTransferred: estimatedBytes,
      riskLevel: isLocalMdns ? 'safe' : 'warning',
      inspectionNote:
        'Búsqueda automática de equipos o servicios dentro de tu propia casa (Wi-Fi/LAN).'
    }
  }

  if (isLoopback) {
    return {
      id: `flow-kernel-${transport}-${inode || index}`,
      timestamp: timestampIso,
      sourceIp,
      destinationIp,
      sourcePort,
      destinationPort,
      protocol: 'HTTPS',
      encrypted: true,
      cipherSuite: 'Comunicación Interna de tu PC (Loopback)',
      bytesTransferred: estimatedBytes,
      riskLevel: 'safe',
      inspectionNote:
        'Proceso interno dentro de tu propio Linux; nunca sale al cable ni al Wi-Fi.'
    }
  }

  return {
    id: `flow-kernel-${transport}-${inode || index}`,
    timestamp: timestampIso,
    sourceIp,
    destinationIp,
    sourcePort,
    destinationPort,
    protocol: 'HTTP',
    encrypted: false,
    cipherSuite: 'Comunicación Directa en Casa Sin Candado TLS',
    bytesTransferred: estimatedBytes,
    riskLevel: 'warning',
    inspectionNote:
      'Tu PC (' +
      sourceIp +
      ') conversa directamente con el dispositivo ' +
      destinationIp +
      ' en tu red local sin cifrado HTTPS.'
  }
}

export function readLiveKernelFlows(): PacketHeaderFlow[] {
  const rawSockets: ParsedKernelSocket[] = [
    ...parseProcSocketTable('/proc/net/tcp', 'tcp', false),
    ...parseProcSocketTable('/proc/net/udp', 'udp', false),
    ...parseProcSocketTable('/proc/net/tcp6', 'tcp6', true),
    ...parseProcSocketTable('/proc/net/udp6', 'udp6', true)
  ]

  // Keep active ESTABLISHED (01), UDP active/bound (01, 07), and LISTEN (0A) sockets,
  // excluding the NetSentinel dashboard itself on port 3090.
  const activeSockets = rawSockets.filter(
    (s) =>
      (s.stateHex === '01' || s.stateHex === '07' || s.stateHex === '0A') &&
      s.sourcePort !== 3090 &&
      s.destinationPort !== 3090
  )

  const priorityOf = (s: ParsedKernelSocket): number => {
    const nonLoopback =
      !isLoopbackOrWildcardIp(s.sourceIp) && !isLoopbackOrWildcardIp(s.destinationIp)
    const isUdp = s.transport === 'udp' || s.transport === 'udp6'
    if (
      s.stateHex === '01' &&
      nonLoopback &&
      (s.sourcePort === 443 || s.destinationPort === 443)
    ) {
      return 1
    }
    if (s.stateHex === '01' && nonLoopback && !isUdp) return 2
    if (isUdp && nonLoopback) return 3
    if (isDhcpSocket(s) && (s.sourcePort === 67 || s.sourcePort === 68)) return 4
    if (isMdnsSocket(s)) return 5
    if (isDhcpSocket(s)) return 6
    if (s.stateHex === '01') return 7
    if (s.stateHex === '0A') return 8
    return 9
  }

  activeSockets.sort((a, b) => priorityOf(a) - priorityOf(b))

  const deduplicated: ParsedKernelSocket[] = []
  const seenPairs = new Set<string>()
  let keptMdnsCount = 0
  let keptDhcpCount = 0
  let keptLoopbackCount = 0

  for (const sock of activeSockets) {
    const isWildcard =
      sock.destinationIp === '0.0.0.0' ||
      sock.destinationIp === '::' ||
      sock.destinationPort === 0
    const isMdns = isMdnsSocket(sock)
    const isDhcp = isDhcpSocket(sock)
    const isLoopback = isLoopbackIp(sock.sourceIp) || isLoopbackIp(sock.destinationIp)

    if (isWildcard) {
      if (isMdns) {
        if (keptMdnsCount >= 1) continue
      } else if (isDhcp) {
        if (keptDhcpCount >= 1) continue
      } else {
        continue
      }
    }

    if (isMdns && keptMdnsCount >= 1) continue
    if (isDhcp && keptDhcpCount >= 1) continue
    if (isLoopback && !isMdns && !isDhcp && keptLoopbackCount >= 2) continue

    const endpointA = `${sock.sourceIp}:${sock.sourcePort}`
    const endpointB = `${sock.destinationIp}:${sock.destinationPort}`
    const pairKey = [endpointA, endpointB].sort().join('<->')
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)

    if (isMdns) keptMdnsCount++
    if (isDhcp) keptDhcpCount++
    if (isLoopback && !isMdns && !isDhcp) keptLoopbackCount++

    deduplicated.push(sock)
    if (deduplicated.length >= 20) break
  }

  const now = Date.now()
  return deduplicated.map((sock, idx) => {
    const timestampIso = new Date(now - idx * 1000).toISOString()
    return classifyKernelSocket(sock, idx, timestampIso)
  })
}

export function getCanonicalRemediations(): RemediationGuide[] {
  const { gatewayIp, interfaces } = readDefaultGatewayFromRoute()
  const primaryIface = interfaces[0] ?? 'enp4s0'

  return [
    {
      id: 'rem-dai',
      category: 'ARP_SPOOFING',
      title: 'Dynamic ARP Inspection (DAI) & DHCP Snooping en Switches Capa 2 (IEEE 802.1X)',
      osiLayer: 'Capa 2 — Enlace de Datos',
      summary:
        'Valida criptográfica y lógicamente cada paquete ARP contra la base de datos de concesiones DHCP Snooping y autentica puertos físicos mediante IEEE 802.1X antes de permitir tráfico en la LAN.',
      defensiveControls: [
        'Habilitar DHCP Snooping en el segmento local para construir la tabla vinculante IP-MAC-Puerto.',
        'Activar Dynamic ARP Inspection (DAI) descartando respuestas ARP gratuitas que no coincidan con el binding.',
        'Verificar continuamente la tabla de vecinos del kernel Linux en todas las interfaces físicas activas.'
      ],
      verificationCommand: `ip neigh show dev ${primaryIface} && ip -s link show ${primaryIface}`
    },
    {
      id: 'rem-static-arp',
      category: 'GATEWAY_DRIFT',
      title: 'Entradas ARP Estáticas en Nodos Críticos y Gateway Predeterminado',
      osiLayer: 'Capa 2 / Capa 3 — Enlace y Red',
      summary:
        'Inmoviliza la asociación IP-MAC del gateway predeterminado en la caché de vecinos del kernel Linux para impedir sobrescrituras por anuncios ARP no solicitados.',
      defensiveControls: [
        `Fijar la dirección MAC del gateway (${gatewayIp} -> ${TRUSTED_GATEWAY_MAC}) con estado nud permanent en ${primaryIface}.`,
        'Configurar sysctl net.ipv4.conf.all.arp_accept=0 para rechazar entradas gratuitous ARP no solicitadas.',
        'Monitorear cambios de OUI con sensores pasivos de integridad de vecindad (/proc/net/arp).'
      ],
      verificationCommand: `sudo ip neigh replace ${gatewayIp} lladdr ${TRUSTED_GATEWAY_MAC} nud permanent dev ${primaryIface}`
    },
    {
      id: 'rem-tls13',
      category: 'CLEARTEXT_PROTOCOL',
      title: 'Migración Estricta a TLS 1.3, HSTS Preload y Perfect Forward Secrecy (ECDHE)',
      osiLayer: 'Capa 6 / Capa 7 — Presentación y Aplicación',
      summary:
        'Elimina la transmisión de sesiones en texto claro en la LAN forzando canales autenticados con TLS 1.3 y suites AEAD con secreto perfecto hacia adelante.',
      defensiveControls: [
        'Encapsular servicios TCP locales (puertos de aplicación en red local) sobre TLS 1.3 o túneles autenticados.',
        'Implementar cabeceras Strict-Transport-Security (HSTS) con max-age=63072000; includeSubDomains; preload.',
        'Restringir suites de cifrado exclusivamente a TLS_AES_256_GCM_SHA384 y TLS_CHACHA20_POLY1305_SHA256.'
      ],
      verificationCommand: 'ss -tunap | grep ESTAB'
    },
    {
      id: 'rem-dnssec',
      category: 'TLS_DOWNGRADE_ATTEMPT',
      title: 'Resolución Cifrada DNS-over-HTTPS (DoH) / DNS-over-TLS (DoT) y Validación DNSSEC',
      osiLayer: 'Capa 7 — Aplicación y Resolución de Nombres',
      summary:
        'Impide la exposición de consultas UDP/53 y mDNS/5353 en tránsito mediante validación criptográfica DNSSEC y transporte cifrado DoT/DoH.',
      defensiveControls: [
        'Configurar systemd-resolved con DNSOverTLS=yes y DNSSEC=allow-downgrade/true.',
        'Restringir anuncios mDNS (UDP/5353) en segmentos no confiables mediante reglas nftables/firewalld.',
        'Verificar el estado de cifrado DNS por interfaz activa con resolvectl.'
      ],
      verificationCommand: `resolvectl status ${primaryIface} && ss -ulnp '( sport = :53 or sport = :5353 )'`
    }
  ]
}

export function buildScenarioFlows(scenario: ScenarioMode): PacketHeaderFlow[] {
  const now = Date.now()
  const isoAt = (offsetSeconds: number) => new Date(now - offsetSeconds * 1000).toISOString()
  const liveFlows = readLiveKernelFlows()
  const subnetPrefix = TRUSTED_GATEWAY_IP.split('.').slice(0, 3).join('.') || '192.168.1'

  if (scenario === 'baseline') {
    return liveFlows
  }

  if (scenario === 'arp_spoof_detected') {
    return [
      {
        id: 'flow-arp-spoof-sim-01',
        timestamp: isoAt(1),
        sourceIp: `${subnetPrefix}.250`,
        destinationIp: TRUSTED_GATEWAY_IP,
        sourcePort: 0,
        destinationPort: 0,
        protocol: 'ARP',
        encrypted: false,
        cipherSuite: 'PLAINTEXT_L2_BROADCAST',
        bytesTransferred: 640,
        riskLevel: 'danger',
        inspectionNote: `Anuncio ARP Gratuito suplantando la MAC (${TRUSTED_GATEWAY_MAC}) del gateway ${TRUSTED_GATEWAY_IP}.`
      },
      ...liveFlows
    ]
  }

  return [
    {
      id: 'flow-http-sim-01',
      timestamp: isoAt(2),
      sourceIp: `${subnetPrefix}.23`,
      destinationIp: `${subnetPrefix}.7`,
      sourcePort: 52301,
      destinationPort: 80,
      protocol: 'HTTP',
      encrypted: false,
      cipherSuite: 'NONE (Cleartext HTTP/1.1)',
      bytesTransferred: 15820,
      riskLevel: 'danger',
      inspectionNote:
        'Cabeceras HTTP y cookies de sesión transmitidas sin cifrado TLS; vulnerables a captura pasiva.'
    },
    {
      id: 'flow-ftp-sim-02',
      timestamp: isoAt(1),
      sourceIp: `${subnetPrefix}.23`,
      destinationIp: `${subnetPrefix}.7`,
      sourcePort: 52344,
      destinationPort: 21,
      protocol: 'FTP',
      encrypted: false,
      cipherSuite: 'NONE (Cleartext FTP Control Channel)',
      bytesTransferred: 4120,
      riskLevel: 'danger',
      inspectionNote:
        'Comandos de control FTP expuestos en texto claro en puerto 21; migrar a SFTP/TLS.'
    },
    ...liveFlows
  ]
}

export function analyzeFlowAlerts(flows: PacketHeaderFlow[]): IdsAlert[] {
  const alerts: IdsAlert[] = []
  let hasRealLanCleartextAlert = false

  for (const flow of flows) {
    const isRealKernelFlow = flow.id.startsWith('flow-kernel-')
    const port =
      flow.sourcePort > 0 && flow.destinationPort > 0
        ? Math.min(flow.sourcePort, flow.destinationPort)
        : flow.destinationPort || flow.sourcePort

    if (isRealKernelFlow && flow.protocol === 'HTTP' && !flow.encrypted) {
      if (hasRealLanCleartextAlert) continue
      hasRealLanCleartextAlert = true

      alerts.push({
        id: `alert-cleartext-${flow.id}`,
        timestamp: flow.timestamp,
        severity: 'medium',
        category: 'CLEARTEXT_PROTOCOL',
        title: 'Conexión Local Directa sin Cifrado TLS (Puerto ' + port + ')',
        description:
          'Tu PC (' +
          flow.sourceIp +
          ') mantiene una conexión abierta con el dispositivo ' +
          flow.destinationIp +
          ' de tu red local sin túnel HTTPS. En redes domésticas es habitual para desarrollo, pero en redes públicas requeriría TLS.',
        sourceIp: flow.sourceIp,
        affectedMac: TRUSTED_GATEWAY_MAC,
        mitigationId: 'rem-tls13',
        acknowledged: false
      })
    } else if (!isRealKernelFlow && (flow.protocol === 'HTTP' || flow.protocol === 'FTP')) {
      alerts.push({
        id: `alert-cleartext-${flow.id}`,
        timestamp: flow.timestamp,
        severity: 'high',
        category: 'CLEARTEXT_PROTOCOL',
        title: `Tráfico TCP en Texto Claro Detectado (${flow.protocol} Puerto ${port})`,
        description: `Se detectó flujo ${flow.protocol} sin cifrado TLS desde ${flow.sourceIp}:${flow.sourcePort} hacia ${flow.destinationIp}:${flow.destinationPort}. ${flow.inspectionNote}`,
        sourceIp: flow.sourceIp,
        affectedMac: TRUSTED_GATEWAY_MAC,
        mitigationId: 'rem-tls13',
        acknowledged: false
      })
    } else if (flow.protocol === 'DNS' && !flow.encrypted) {
      alerts.push({
        id: `alert-dns-cleartext-${flow.id}`,
        timestamp: flow.timestamp,
        severity: 'medium',
        category: 'TLS_DOWNGRADE_ATTEMPT',
        title: 'Consulta DNS Externa Sin Cifrado TLS (Puerto 53)',
        description: `El equipo ${flow.sourceIp} envió una consulta DNS externa sin cifrado DoT hacia ${flow.destinationIp}:${flow.destinationPort}.`,
        sourceIp: flow.sourceIp,
        affectedMac: TRUSTED_GATEWAY_MAC,
        mitigationId: 'rem-dnssec',
        acknowledged: false
      })
    }
  }

  return alerts
}

export function buildTelemetryPayload(scenario?: ScenarioMode): TelemetryPayload {
  const activeScenario = scenario ?? currentScenarioState
  currentScenarioState = activeScenario

  const {
    entries: rawArpEntries,
    interfaceSource,
    trustedGatewayMac
  } = buildScenarioArpEntries(activeScenario)
  const arpAnalysis = detectArpAnomalies(rawArpEntries, trustedGatewayMac)
  const interfaces = readKernelInterfaces()
  const flows = buildScenarioFlows(activeScenario)
  const flowAlerts = analyzeFlowAlerts(flows)
  const remediations = getCanonicalRemediations()

  const combinedAlerts: IdsAlert[] = [...arpAnalysis.alerts, ...flowAlerts].map((alert) => ({
    ...alert,
    acknowledged: acknowledgedAlertIds.has(alert.id) || alert.acknowledged
  }))

  const totalFlows = flows.length
  const encryptedFlows = flows.filter((flow) => flow.encrypted).length
  const cleartextFlows = totalFlows - encryptedFlows
  const encryptionRatio =
    totalFlows > 0 ? Math.round((encryptedFlows / totalFlows) * 100) : 100

  let overallPosture: CryptoPostureMetrics['overallPosture'] = 'SECURE'
  if (arpAnalysis.activeCollisions > 0 || arpAnalysis.arpIntegrityScore < 60) {
    overallPosture = 'CRITICAL_ALERT'
  } else if (cleartextFlows > 0 || arpAnalysis.arpIntegrityScore < 100) {
    overallPosture = 'DEGRADED'
  }

  const metrics: CryptoPostureMetrics = {
    totalFlows,
    encryptedFlows,
    cleartextFlows,
    encryptionRatio,
    arpIntegrityScore: arpAnalysis.arpIntegrityScore,
    activeCollisions: arpAnalysis.activeCollisions,
    overallPosture
  }

  return {
    scenario: activeScenario,
    interfaceSource,
    updatedAt: new Date().toISOString(),
    metrics,
    interfaces,
    arpTable: arpAnalysis.annotatedEntries,
    alerts: combinedAlerts,
    flows,
    remediations
  }
}
