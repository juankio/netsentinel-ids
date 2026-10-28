import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  SeverityLevel,
  ScenarioMode,
  ArpEntry,
  IdsAlert,
  PacketHeaderFlow,
  CryptoPostureMetrics,
  RemediationGuide,
  InterfaceTrafficStat,
  TelemetryPayload
} from '~/types/network'

const DEFAULT_METRICS: CryptoPostureMetrics = {
  totalFlows: 0,
  encryptedFlows: 0,
  cleartextFlows: 0,
  encryptionRatio: 100,
  arpIntegrityScore: 100,
  activeCollisions: 0,
  overallPosture: 'SECURE'
}

export const useSentinelStore = defineStore('sentinel', () => {
  const scenario = ref<ScenarioMode>('baseline')
  const interfaceSource = ref<string>('eth0 (kernel /proc/net/arp)')
  const updatedAt = ref<string>(new Date().toISOString())
  const metrics = ref<CryptoPostureMetrics>({ ...DEFAULT_METRICS })

  const arpEntriesById = ref<Record<string, ArpEntry>>({})
  const alertsById = ref<Record<string, IdsAlert>>({})
  const flowsById = ref<Record<string, PacketHeaderFlow>>({})
  const remediationsById = ref<Record<string, RemediationGuide>>({})
  const interfaces = ref<InterfaceTrafficStat[]>([])

  const selectedInterface = ref<string>('ALL')
  const selectedProtocol = ref<string>('ALL')
  const searchQuery = ref<string>('')
  const activeRemediationId = ref<string | null>(null)
  const isRemediationModalOpen = ref<boolean>(false)
  const isLoading = ref<boolean>(false)
  const error = ref<string | null>(null)

  const arpList = computed<ArpEntry[]>(() => Object.values(arpEntriesById.value))
  const arpTable = computed<ArpEntry[]>(() => {
    if (selectedInterface.value === 'ALL') {
      return arpList.value
    }
    return arpList.value.filter(
      (entry) => entry.interfaceName === selectedInterface.value
    )
  })

  const alertsList = computed<IdsAlert[]>(() => Object.values(alertsById.value))
  const alerts = computed<IdsAlert[]>(() => alertsList.value)

  const unacknowledgedAlertsCount = computed<number>(
    () => alertsList.value.filter((alert) => !alert.acknowledged).length
  )

  const highestAlertSeverity = computed<SeverityLevel | null>(() => {
    const rank: Record<SeverityLevel, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    }
    let highest: SeverityLevel | null = null
    for (const alert of alertsList.value) {
      if (alert.acknowledged) continue
      if (!highest || rank[alert.severity] > rank[highest]) {
        highest = alert.severity
      }
    }
    return highest
  })

  const remediationsList = computed<RemediationGuide[]>(() =>
    Object.values(remediationsById.value)
  )
  const remediations = computed<RemediationGuide[]>(() => remediationsList.value)

  const filteredFlowsList = computed<PacketHeaderFlow[]>(() => {
    const allFlows = Object.values(flowsById.value)
    const protocolFilter = selectedProtocol.value.trim().toUpperCase()
    const query = searchQuery.value.trim().toLowerCase()

    return allFlows.filter((flow) => {
      const matchesProtocol =
        protocolFilter === '' ||
        protocolFilter === 'ALL' ||
        flow.protocol.toUpperCase() === protocolFilter

      if (!matchesProtocol) return false
      if (!query) return true

      return (
        flow.sourceIp.toLowerCase().includes(query) ||
        flow.destinationIp.toLowerCase().includes(query) ||
        flow.protocol.toLowerCase().includes(query) ||
        flow.cipherSuite.toLowerCase().includes(query) ||
        flow.inspectionNote.toLowerCase().includes(query) ||
        String(flow.sourcePort).includes(query) ||
        String(flow.destinationPort).includes(query)
      )
    })
  })

  const flows = computed<PacketHeaderFlow[]>(() => filteredFlowsList.value)

  const activeRemediation = computed<RemediationGuide | null>(() => {
    if (!activeRemediationId.value) return null
    return remediationsById.value[activeRemediationId.value] ?? null
  })

  function hydrateTelemetry(payload: TelemetryPayload) {
    scenario.value = payload.scenario
    interfaceSource.value = payload.interfaceSource
    updatedAt.value = payload.updatedAt
    metrics.value = { ...payload.metrics }
    interfaces.value = payload.interfaces ?? []

    const nextArp: Record<string, ArpEntry> = {}
    for (const entry of payload.arpTable) {
      nextArp[entry.id] = entry
    }
    arpEntriesById.value = nextArp

    const nextAlerts: Record<string, IdsAlert> = {}
    for (const alert of payload.alerts) {
      const previouslyAcknowledged = alertsById.value[alert.id]?.acknowledged ?? false
      nextAlerts[alert.id] = {
        ...alert,
        acknowledged: alert.acknowledged || previouslyAcknowledged
      }
    }
    alertsById.value = nextAlerts

    const nextFlows: Record<string, PacketHeaderFlow> = {}
    for (const flow of payload.flows) {
      nextFlows[flow.id] = flow
    }
    flowsById.value = nextFlows

    const nextRemediations: Record<string, RemediationGuide> = {}
    for (const guide of payload.remediations) {
      nextRemediations[guide.id] = guide
    }
    remediationsById.value = nextRemediations
  }

  function setInterfaceFilter(ifaceName: string) {
    selectedInterface.value = ifaceName || 'ALL'
  }

  function setProtocolFilter(protocol: string) {
    selectedProtocol.value = protocol.trim() || 'ALL'
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  function acknowledgeAlert(alertId: string) {
    const target = alertsById.value[alertId]
    if (!target) return
    alertsById.value = {
      ...alertsById.value,
      [alertId]: {
        ...target,
        acknowledged: true
      }
    }
  }

  function openRemediationModal(remediationId: string) {
    activeRemediationId.value = remediationId
    isRemediationModalOpen.value = true
  }

  function closeRemediationModal() {
    isRemediationModalOpen.value = false
    activeRemediationId.value = null
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  function setError(errorMessage: string | null) {
    error.value = errorMessage
  }

  return {
    scenario,
    interfaceSource,
    updatedAt,
    metrics,
    interfaces,
    arpEntriesById,
    alertsById,
    flowsById,
    remediationsById,
    selectedInterface,
    selectedProtocol,
    searchQuery,
    activeRemediationId,
    isRemediationModalOpen,
    isLoading,
    error,
    arpList,
    arpTable,
    alertsList,
    alerts,
    unacknowledgedAlertsCount,
    highestAlertSeverity,
    remediationsList,
    remediations,
    filteredFlowsList,
    flows,
    activeRemediation,
    hydrateTelemetry,
    setInterfaceFilter,
    setProtocolFilter,
    setSearchQuery,
    acknowledgeAlert,
    openRemediationModal,
    closeRemediationModal,
    setLoading,
    setError
  }
})
