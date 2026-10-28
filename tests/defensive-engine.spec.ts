import { describe, it, expect } from 'vitest'
import {
  buildScenarioArpEntries,
  detectArpAnomalies,
  TRUSTED_GATEWAY_IP,
  TRUSTED_GATEWAY_MAC
} from '../server/utils/arpInspector'
import { buildTelemetryPayload } from '../server/utils/protocolTelemetry'
import {
  SimulateScenarioBodySchema,
  ScenarioQuerySchema,
  AcknowledgeAlertBodySchema
} from '../server/utils/schemas'
import type { ArpEntry } from '../types/network'

describe('NetSentinel IDS — Motor Defensivo de Integridad ARP y Telemetría', () => {
  it('detectArpAnomalies() marca colisiones MAC duplicadas entre el gateway y un host atacante con alerta ARP_SPOOFING', () => {
    const spoofedEntries: ArpEntry[] = [
      {
        id: 'arp-gw',
        ipAddress: TRUSTED_GATEWAY_IP,
        macAddress: TRUSTED_GATEWAY_MAC,
        interfaceName: 'eth0',
        vendor: 'Cisco Systems (Gateway)',
        isGateway: true,
        isStatic: true,
        status: 'trusted',
        lastSeen: new Date().toISOString()
      },
      {
        id: 'arp-attacker',
        ipAddress: '10.20.30.99',
        macAddress: TRUSTED_GATEWAY_MAC,
        interfaceName: 'eth0',
        vendor: 'Nodo No Autorizado',
        isGateway: false,
        isStatic: false,
        status: 'trusted',
        lastSeen: new Date().toISOString()
      }
    ]

    const result = detectArpAnomalies(spoofedEntries)

    expect(result.activeCollisions).toBeGreaterThan(0)
    expect(result.arpIntegrityScore).toBeLessThan(100)
    expect(
      result.annotatedEntries.every((entry) => entry.status === 'collision')
    ).toBe(true)

    const spoofingAlert = result.alerts.find(
      (alert) => alert.category === 'ARP_SPOOFING'
    )
    expect(spoofingAlert).toBeDefined()
    expect(spoofingAlert?.severity).toBe('critical')
    expect(spoofingAlert?.sourceIp).toBe('10.20.30.99')
    expect(spoofingAlert?.affectedMac).toBe(TRUSTED_GATEWAY_MAC)
    expect(spoofingAlert?.mitigationId).toBe('rem-dai')
  })

  it('detectArpAnomalies() retorna arpIntegrityScore de 100 y 0 colisiones en escenario baseline limpio con telemetría real del kernel', () => {
    const { entries, trustedGatewayMac } = buildScenarioArpEntries('baseline')
    const result = detectArpAnomalies(entries, trustedGatewayMac)

    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some((entry) => entry.ipAddress.startsWith('10.20.30.'))).toBe(false)
    expect(result.activeCollisions).toBe(0)
    expect(result.arpIntegrityScore).toBe(100)
    expect(result.alerts).toHaveLength(0)
    expect(
      result.annotatedEntries.every((entry) => entry.status === 'trusted')
    ).toBe(true)
  })

  it('buildTelemetryPayload("baseline") extrae interfaces reales (/proc/net/dev) y sockets activos del kernel (/proc/net/tcp|udp) sin ruido del puerto 3090', () => {
    const payload = buildTelemetryPayload('baseline')

    expect(payload.scenario).toBe('baseline')
    expect(payload.interfaces).toBeDefined()
    expect(payload.interfaces?.length).toBeGreaterThan(0)
    expect(payload.arpTable.length).toBeGreaterThan(0)
    expect(payload.flows.length).toBeGreaterThan(0)
    expect(payload.flows.some((f) => f.sourceIp.startsWith('10.20.30.'))).toBe(false)
    expect(
      payload.flows.some((f) => f.sourcePort === 3090 || f.destinationPort === 3090)
    ).toBe(false)

    const gatewayEntry = payload.arpTable.find((entry) => entry.isGateway)
    if (gatewayEntry) {
      expect(gatewayEntry.vendor).toBe('Tu Router de Internet (Gateway Principal)')
    }

    const loopbackFlows = payload.flows.filter(
      (f) =>
        (f.sourceIp.startsWith('127.') || f.sourceIp === '::1') &&
        f.sourcePort !== 5353 &&
        f.destinationPort !== 5353
    )
    expect(loopbackFlows.length).toBeLessThanOrEqual(2)
  })

  it('buildTelemetryPayload("cleartext_exposure") calcula encryptionRatio, genera alertas CLEARTEXT_PROTOCOL para HTTP/FTP y vincula mitigationId válido', () => {
    const payload = buildTelemetryPayload('cleartext_exposure')

    expect(payload.scenario).toBe('cleartext_exposure')
    expect(payload.metrics.totalFlows).toBeGreaterThan(0)
    expect(payload.metrics.cleartextFlows).toBeGreaterThan(0)
    expect(payload.metrics.encryptionRatio).toBe(
      Math.round((payload.metrics.encryptedFlows / payload.metrics.totalFlows) * 100)
    )
    expect(payload.metrics.encryptionRatio).toBeLessThan(100)

    const cleartextAlerts = payload.alerts.filter(
      (alert) => alert.category === 'CLEARTEXT_PROTOCOL'
    )
    expect(cleartextAlerts.length).toBeGreaterThanOrEqual(2)

    const validMitigationIds = new Set(payload.remediations.map((rem) => rem.id))
    expect(validMitigationIds.has('rem-dai')).toBe(true)
    expect(validMitigationIds.has('rem-static-arp')).toBe(true)
    expect(validMitigationIds.has('rem-tls13')).toBe(true)
    expect(validMitigationIds.has('rem-dnssec')).toBe(true)

    for (const alert of payload.alerts) {
      expect(validMitigationIds.has(alert.mitigationId)).toBe(true)
    }
  })

  it('SimulateScenarioBodySchema valida escenarios permitidos y rechaza entradas inválidas', () => {
    expect(
      SimulateScenarioBodySchema.safeParse({ scenario: 'baseline' }).success
    ).toBe(true)
    expect(
      SimulateScenarioBodySchema.safeParse({ scenario: 'arp_spoof_detected' }).success
    ).toBe(true)
    expect(
      SimulateScenarioBodySchema.safeParse({ scenario: 'cleartext_exposure' }).success
    ).toBe(true)

    expect(
      SimulateScenarioBodySchema.safeParse({ scenario: 'offensive_mode' }).success
    ).toBe(false)
    expect(SimulateScenarioBodySchema.safeParse({}).success).toBe(false)

    expect(ScenarioQuerySchema.parse({}).scenario).toBe('baseline')
    expect(
      AcknowledgeAlertBodySchema.safeParse({ alertId: 'alert-1' }).success
    ).toBe(true)
    expect(
      AcknowledgeAlertBodySchema.safeParse({ alertId: '' }).success
    ).toBe(false)
  })
})
