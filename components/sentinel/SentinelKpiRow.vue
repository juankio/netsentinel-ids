<script setup lang="ts">
import { computed } from 'vue'
import { useSentinelStore } from '~/stores/sentinel.store'
import type { CryptoPostureMetrics } from '~/types/network'

interface Props {
  metrics: CryptoPostureMetrics
  interfaceSource?: string
  isLive?: boolean
}

const props = withDefaults(defineProps<Props>(), { isLive: true })
const emit = defineEmits<{ refreshNow: []; toggleLive: [] }>()
const store = useSentinelStore()

const updatedTime = computed(() => new Date(store.updatedAt).toLocaleTimeString('es-CO', { hour12: false }))
const uniqueDevicesCount = computed(() => Math.max(new Set(store.arpTable.map((e) => e.ipAddress)).size, 1))
const networkSafe = computed(() => props.metrics.activeCollisions === 0 && props.metrics.arpIntegrityScore === 100)

function friendlyInterfaceLabel(name: string): string {
  if (name.startsWith('en') || name.startsWith('eth')) return `Cable (${name})`
  if (name.startsWith('wl')) return `Wi-Fi (${name})`
  if (name === 'lo') return 'Loopback (lo)'
  return name
}
</script>

<template>
  <section class="space-y-3.5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <span class="sentinel-radar-pulse w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 shrink-0" />
        <div class="min-w-0">
          <div class="flex items-center gap-2.5">
            <h2 class="text-base sm:text-lg font-bold tracking-tight text-foreground whitespace-nowrap">Radar de Red en Tiempo Real</h2>
            <span class="hidden sm:inline-block text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{{ updatedTime }}</span>
          </div>
          <p class="text-xs text-muted-foreground truncate">Lectura directa del kernel Linux (/proc/net)</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <AppButton size="sm" :active="store.selectedInterface === 'ALL'" @click="store.setInterfaceFilter('ALL')">Todas</AppButton>
        <AppButton
          v-for="iface in store.interfaces"
          :key="iface.name"
          size="sm"
          :active="store.selectedInterface === iface.name"
          @click="store.setInterfaceFilter(iface.name)"
        >
          {{ friendlyInterfaceLabel(iface.name) }}
        </AppButton>
        <div class="h-4 w-px bg-border mx-1 hidden sm:block" />
        <AppButton size="sm" variant="outline" @click="emit('toggleLive')">
          <template #icon>
            <span :class="['w-2 h-2 rounded-full', props.isLive ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground']" />
          </template>
          {{ props.isLive ? 'En Vivo (2.5s)' : 'Pausado' }}
        </AppButton>
        <AppButton size="sm" variant="secondary" @click="emit('refreshNow')">
          <template #icon>
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke-linecap="round" /><polyline points="21 3 21 9 15 9" />
            </svg>
          </template>
          Actualizar
        </AppButton>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border border border-border rounded-xl bg-card/60">
      <div class="sentinel-kpi-card flex items-center gap-3.5 p-4 min-w-0">
        <div :class="['w-10 h-10 rounded-lg border flex items-center justify-center shrink-0', networkSafe ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400']">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="min-w-0">
          <span class="text-[11px] font-medium text-muted-foreground block truncate">Escudo ARP</span>
          <span :class="['text-lg font-bold tracking-tight block leading-tight', networkSafe ? 'text-emerald-400' : 'text-amber-400']">
            {{ networkSafe ? 'PROTEGIDO' : 'ALERTA MITM' }}
          </span>
          <span class="text-[11px] text-muted-foreground whitespace-nowrap truncate block">Sin ataques MITM activos</span>
        </div>
      </div>

      <div class="sentinel-kpi-card flex items-center gap-3.5 p-4 min-w-0">
        <div class="w-10 h-10 rounded-lg border bg-primary/10 border-primary/30 text-primary flex items-center justify-center shrink-0">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="14" width="20" height="6" rx="2" /><path d="M6 14V8M18 14V8M6 17h.01M10 17h.01" stroke-linecap="round" />
          </svg>
        </div>
        <div class="min-w-0">
          <span class="text-[11px] font-medium text-muted-foreground block truncate">Autenticidad Router</span>
          <span class="text-lg font-bold font-mono text-foreground block leading-tight">{{ metrics.arpIntegrityScore }}%</span>
          <span class="text-[11px] text-muted-foreground whitespace-nowrap truncate block">MAC de router verificada</span>
        </div>
      </div>

      <div class="sentinel-kpi-card flex items-center gap-3.5 p-4 min-w-0">
        <div class="w-10 h-10 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div class="min-w-0">
          <span class="text-[11px] font-medium text-muted-foreground block truncate">Tráfico Cifrado</span>
          <span class="text-lg font-bold font-mono text-foreground block leading-tight">{{ metrics.encryptionRatio }}%</span>
          <span class="text-[11px] text-muted-foreground whitespace-nowrap truncate block">{{ metrics.encryptedFlows }}/{{ metrics.totalFlows }} canales con candado</span>
        </div>
      </div>

      <div class="sentinel-kpi-card flex items-center gap-3.5 p-4 min-w-0">
        <div class="w-10 h-10 rounded-lg border bg-primary/10 border-primary/30 text-primary flex items-center justify-center shrink-0">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" stroke-linecap="round" />
          </svg>
        </div>
        <div class="min-w-0">
          <span class="text-[11px] font-medium text-muted-foreground block truncate">Equipos en Casa</span>
          <span class="text-lg font-bold font-mono text-foreground block leading-tight">{{ uniqueDevicesCount }}</span>
          <span class="text-[11px] text-muted-foreground whitespace-nowrap truncate block">Dispositivos únicos en tu LAN</span>
        </div>
      </div>
    </div>
  </section>
</template>
