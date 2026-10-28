export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'
export type ScenarioMode = 'baseline' | 'arp_spoof_detected' | 'cleartext_exposure'

export interface ArpEntry {
  id: string
  ipAddress: string
  macAddress: string
  interfaceName: string
  vendor: string
  isGateway: boolean
  isStatic: boolean
  status: 'trusted' | 'collision' | 'gateway_drift'
  lastSeen: string
}

export interface IdsAlert {
  id: string
  timestamp: string
  severity: SeverityLevel
  category: 'ARP_SPOOFING' | 'GATEWAY_DRIFT' | 'CLEARTEXT_PROTOCOL' | 'TLS_DOWNGRADE_ATTEMPT'
  title: string
  description: string
  sourceIp: string
  affectedMac: string
  mitigationId: string
  acknowledged: boolean
}

export interface PacketHeaderFlow {
  id: string
  timestamp: string
  sourceIp: string
  destinationIp: string
  sourcePort: number
  destinationPort: number
  protocol: 'TLSv1.3' | 'HTTPS' | 'SSHv2' | 'DNSSEC' | 'DNS' | 'HTTP' | 'FTP' | 'ARP'
  encrypted: boolean
  cipherSuite: string
  bytesTransferred: number
  riskLevel: 'safe' | 'warning' | 'danger'
  inspectionNote: string
}

export interface CryptoPostureMetrics {
  totalFlows: number
  encryptedFlows: number
  cleartextFlows: number
  encryptionRatio: number
  arpIntegrityScore: number
  activeCollisions: number
  overallPosture: 'SECURE' | 'DEGRADED' | 'CRITICAL_ALERT'
}

export interface RemediationGuide {
  id: string
  category: IdsAlert['category']
  title: string
  osiLayer: string
  summary: string
  defensiveControls: string[]
  verificationCommand: string
}

export interface InterfaceTrafficStat {
  name: string
  ipv4: string
  mac: string
  rxBytes: number
  rxPackets: number
  txBytes: number
  txPackets: number
  dropPackets: number
  isUp: boolean
}

export interface TelemetryPayload {
  scenario: ScenarioMode
  interfaceSource: string
  updatedAt: string
  metrics: CryptoPostureMetrics
  interfaces?: InterfaceTrafficStat[]
  arpTable: ArpEntry[]
  alerts: IdsAlert[]
  flows: PacketHeaderFlow[]
  remediations: RemediationGuide[]
}

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  message: string
  error: Record<string, unknown> | string | null
}
