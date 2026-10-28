<script setup lang="ts">
const store = useSentinelStore()
const telemetry = useSentinelTelemetry()
const motion = useSentinelMotion()

async function handleRefresh() {
  await telemetry.fetchTelemetry()
  await nextTick()
  motion.animateScenarioPulse()
}

onMounted(async () => {
  await telemetry.fetchTelemetry()
  telemetry.startAutoRefresh()
  await nextTick()
  motion.animateDashboardEntrance()
})
</script>

<template>
  <div class="space-y-6">
    <SentinelKpiRow
      :metrics="store.metrics"
      :interface-source="store.interfaceSource"
      :is-live="telemetry.isAutoRefresh.value"
      @refresh-now="handleRefresh"
      @toggle-live="telemetry.toggleAutoRefresh"
    />

    <NetworkTopologyRadar
      :arp-entries="store.arpTable"
      :flows="store.flows"
      :metrics="store.metrics"
      :interfaces="store.interfaces"
    />

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div class="lg:col-span-7">
        <ArpDefenseTable :entries="store.arpTable" :alerts="store.alerts" />
      </div>
      <div class="lg:col-span-5">
        <CryptoPosturePanel
          :metrics="store.metrics"
          :remediations="store.remediations"
          :alerts="store.alerts"
        />
      </div>
    </div>

    <ProtocolTelemetryFeed
      :flows="store.flows"
      :selected-protocol="store.selectedProtocol"
      :search-query="store.searchQuery"
    />

    <RemediationModal />
  </div>
</template>
