<script setup lang="ts">
import { computed } from 'vue'
import { useSentinelStore } from '~/stores/sentinel.store'
import type { ArpEntry, IdsAlert } from '~/types/network'

interface Props {
  entries: ArpEntry[]
  alerts: IdsAlert[]
}

interface GroupedArpDevice {
  ipAddress: string
  macAddress: string
  vendor: string
  isGateway: boolean
  isStatic: boolean
  status: ArpEntry['status']
  interfaces: string[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  inspectRemediation: [mitigationId: string]
  acknowledgeAlert: [alertId: string]
}>()

const store = useSentinelStore()
const layer2Alerts = computed(() =>
  props.alerts.filter((a) => a.category === 'ARP_SPOOFING' || a.category === 'GATEWAY_DRIFT')
)

const groupedDevices = computed<GroupedArpDevice[]>(() => {
  const map = new Map<string, GroupedArpDevice>()
  for (const entry of props.entries) {
    const existing = map.get(entry.ipAddress)
    if (existing) {
      if (!existing.interfaces.includes(entry.interfaceName)) existing.interfaces.push(entry.interfaceName)
      if (entry.status !== 'trusted') existing.status = entry.status
      if (entry.isGateway) existing.isGateway = true
      if (entry.isStatic) existing.isStatic = true
    } else {
      map.set(entry.ipAddress, {
        ipAddress: entry.ipAddress,
        macAddress: entry.macAddress,
        vendor: entry.vendor,
        isGateway: entry.isGateway,
        isStatic: entry.isStatic,
        status: entry.status,
        interfaces: [entry.interfaceName]
      })
    }
  }
  return Array.from(map.values())
})

function deviceHumanRole(entry: GroupedArpDevice) {
  if (entry.isGateway) return { title: 'Tu Router de Internet', badge: 'Gateway', variant: 'primary' as const, icon: 'router' as const }
  if (entry.isStatic || entry.vendor.includes('Este Equipo') || entry.vendor.includes('Host Local')) {
    return { title: 'Este Equipo Linux (Tu PC)', badge: 'Tu PC', variant: 'success' as const, icon: 'pc' as const }
  }
  return { title: 'Dispositivo en tu Casa', badge: 'Vecino LAN', variant: 'neutral' as const, icon: 'device' as const }
}

function ifaceLabel(iface: string): string {
  if (iface.startsWith('en') || iface.startsWith('eth')) return `Cable (${iface})`
  if (iface.startsWith('wl')) return `Wi-Fi (${iface})`
  return iface
}

function onInspect(mitigationId: string) {
  store.openRemediationModal(mitigationId)
  emit('inspectRemediation', mitigationId)
}
</script>

<template>
  <AppCard
    class="sentinel-panel"
    title="Equipos Conectados en tu Casa (Tabla ARP Capa 2)"
    subtitle="Dispositivos físicos agrupados por IP con validación de huella MAC en tiempo real"
    no-padding
  >
    <div v-if="layer2Alerts.length > 0" class="px-5 py-3 border-b border-border bg-rose-500/10 flex items-center justify-between gap-3">
      <span class="text-xs text-rose-300 font-medium truncate">
        Alerta Capa 2: {{ layer2Alerts[0].title }} ({{ layer2Alerts[0].sourceIp }})
      </span>
      <AppButton size="sm" variant="danger" @click="onInspect(layer2Alerts[0].mitigationId)">Mitigar</AppButton>
    </div>

    <div class="divide-y divide-border">
      <div
        v-for="device in groupedDevices"
        :key="device.ipAddress"
        :class="['grid grid-cols-12 items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/25', device.status !== 'trusted' ? 'sentinel-alert-row bg-rose-500/10' : '']"
      >
        <div class="col-span-5 flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-lg border border-border bg-muted/40 flex items-center justify-center shrink-0 text-primary">
            <svg v-if="deviceHumanRole(device).icon === 'router'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="2" y="14" width="20" height="6" rx="2" /><path d="M6 14V7M18 14V7M6 17h.01M10 17h.01" stroke-linecap="round" />
            </svg>
            <svg v-else-if="deviceHumanRole(device).icon === 'pc'" class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" stroke-linecap="round" />
            </svg>
            <svg v-else class="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="6" y="2" width="12" height="20" rx="2" /><path d="M12 18h.01" stroke-linecap="round" />
            </svg>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap truncate">{{ deviceHumanRole(device).title }}</span>
              <AppBadge :variant="deviceHumanRole(device).variant">{{ deviceHumanRole(device).badge }}</AppBadge>
            </div>
            <span class="text-[11px] text-muted-foreground truncate block">{{ device.vendor }}</span>
          </div>
        </div>

        <div class="col-span-3 min-w-0">
          <span class="font-mono font-semibold text-sm text-foreground block">{{ device.ipAddress }}</span>
          <div class="flex flex-wrap items-center gap-1 mt-0.5">
            <span v-for="iface in device.interfaces" :key="iface" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground">
              {{ ifaceLabel(iface) }}
            </span>
          </div>
        </div>

        <div class="col-span-2">
          <span class="font-mono text-xs whitespace-nowrap px-2 py-1 rounded bg-muted border border-border text-muted-foreground">{{ device.macAddress }}</span>
        </div>

        <div class="col-span-2 text-right">
          <AppBadge :variant="device.status === 'trusted' ? 'success' : 'danger'" :pulse="device.status !== 'trusted'">
            {{ device.status === 'trusted' ? 'Verificado' : 'Clonación MAC' }}
          </AppBadge>
        </div>
      </div>
    </div>
  </AppCard>
</template>
