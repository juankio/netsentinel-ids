<script setup lang="ts">
import { computed } from 'vue'
import { useSentinelStore } from '~/stores/sentinel.store'
import type { PacketHeaderFlow } from '~/types/network'

interface Props {
  flows: PacketHeaderFlow[]
  selectedProtocol?: string
  searchQuery?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:selectedProtocol': [val: string]
  'update:searchQuery': [val: string]
}>()

const store = useSentinelStore()
const activeProtocol = computed(() => props.selectedProtocol ?? store.selectedProtocol)
const activeSearchQuery = computed(() => props.searchQuery ?? store.searchQuery)
const protocols = ['ALL', 'TLSv1.3', 'HTTPS', 'SSHv2', 'DNSSEC', 'HTTP', 'ARP']

function onSelectProtocol(proto: string) {
  store.setProtocolFilter(proto)
  emit('update:selectedProtocol', proto)
}

function onUpdateSearch(val: string) {
  store.setSearchQuery(val)
  emit('update:searchQuery', val)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function explainFlow(flow: PacketHeaderFlow): string {
  if (flow.destinationPort === 443 || flow.protocol === 'TLSv1.3' || flow.protocol === 'HTTPS') {
    return `Conexión web segura hacia ${flow.destinationIp}:443 (${flow.cipherSuite})`
  }
  if (flow.destinationIp.startsWith('127.') || flow.sourceIp.startsWith('127.')) {
    return `Servicio local interno en tu propio PC (puerto ${flow.destinationPort})`
  }
  if (flow.protocol === 'SSHv2') return 'Administración remota mediante túnel cifrado SSHv2'
  return flow.inspectionNote
}

function riskBadgeVariant(risk: PacketHeaderFlow['riskLevel']) {
  return risk === 'safe' ? 'success' : risk === 'warning' ? 'warning' : 'danger'
}
</script>

<template>
  <AppCard
    class="sentinel-panel"
    title="Actividad de Conexiones en Vivo"
    subtitle="Sockets TCP/UDP activos en el kernel Linux explicados en una sola línea"
    no-padding
  >
    <div class="px-5 py-3 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-muted/10">
      <div class="flex items-center gap-1.5 flex-wrap">
        <AppButton
          v-for="proto in protocols"
          :key="proto"
          size="sm"
          :active="activeProtocol === proto"
          @click="onSelectProtocol(proto)"
        >
          {{ proto === 'ALL' ? 'Todos' : proto }}
        </AppButton>
      </div>
      <div class="w-full lg:w-72">
        <AppInput
          :model-value="activeSearchQuery"
          placeholder="Filtrar por IP, puerto o protocolo..."
          @update:model-value="onUpdateSearch"
        />
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <th class="py-2.5 px-4 w-24">Hora</th>
            <th class="py-2.5 px-4 w-64">Origen → Destino</th>
            <th class="py-2.5 px-4 w-24">Protocolo</th>
            <th class="py-2.5 px-4">Resumen Claro</th>
            <th class="py-2.5 px-4 w-36 text-right">Privacidad</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border text-xs">
          <tr v-for="flow in flows" :key="flow.id" class="hover:bg-muted/20 transition-colors">
            <td class="py-3 px-4 w-24 font-mono text-muted-foreground whitespace-nowrap">
              {{ formatTime(flow.timestamp) }}
            </td>
            <td class="py-3 px-4 w-64 font-mono text-foreground whitespace-nowrap">
              <span>{{ flow.sourceIp }}:{{ flow.sourcePort }}</span>
              <span class="text-primary mx-1.5">→</span>
              <span>{{ flow.destinationIp }}:{{ flow.destinationPort }}</span>
            </td>
            <td class="py-3 px-4 w-24 whitespace-nowrap">
              <AppBadge :variant="riskBadgeVariant(flow.riskLevel)">{{ flow.protocol }}</AppBadge>
            </td>
            <td class="py-3 px-4 whitespace-nowrap max-w-md truncate text-foreground" :title="explainFlow(flow)">
              {{ explainFlow(flow) }}
            </td>
            <td class="py-3 px-4 w-36 whitespace-nowrap text-right">
              <span v-if="flow.encrypted" class="inline-flex items-center justify-end gap-1.5 text-emerald-400 font-medium">
                <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Blindado TLS
              </span>
              <span v-else class="inline-flex items-center justify-end gap-1.5 text-amber-400 font-medium">
                <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                Local sin TLS
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppCard>
</template>
