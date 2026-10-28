<script setup lang="ts">
import { computed } from 'vue'
import { useSentinelStore } from '~/stores/sentinel.store'
import type { CryptoPostureMetrics, IdsAlert, RemediationGuide } from '~/types/network'

interface Props {
  metrics: CryptoPostureMetrics
  remediations?: RemediationGuide[]
  alerts?: IdsAlert[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ inspectRemediation: [mitigationId: string] }>()
const store = useSentinelStore()

const circumference = 2 * Math.PI * 30
const dashOffset = computed(() => circumference - (props.metrics.encryptionRatio / 100) * circumference)

const defenseCards = [
  { id: 'rem-dai', code: 'L2 · DAI', label: 'Dynamic ARP Inspection', sub: 'Validar paquetes ARP en switch' },
  { id: 'rem-static-arp', code: 'L2 · ARP', label: 'Tabla ARP Estática', sub: 'Fijar MAC del router en Linux' },
  { id: 'rem-tls13', code: 'L7 · TLS', label: 'Forzar TLS 1.3 + HSTS', sub: 'Bloquear sesiones texto plano' },
  { id: 'rem-dnssec', code: 'L7 · DNS', label: 'DNS Cifrado DoH/DoT', sub: 'Ocultar consultas de dominios' }
]

function onInspect(mitigationId: string) {
  store.openRemediationModal(mitigationId)
  emit('inspectRemediation', mitigationId)
}
</script>

<template>
  <AppCard
    class="sentinel-panel"
    title="Postura Criptográfica y Blindaje de Tráfico"
    subtitle="Inspección visual de canales cifrados frente a puertos locales abiertos"
    no-padding
  >
    <div class="flex items-center gap-5 p-5 border-b border-border">
      <div class="relative w-20 h-20 shrink-0 flex items-center justify-center">
        <svg class="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" class="stroke-muted fill-none" stroke-width="6" />
          <circle
            cx="36"
            cy="36"
            r="30"
            :class="['fill-none transition-all duration-500', metrics.encryptionRatio >= 80 ? 'stroke-emerald-400' : 'stroke-amber-400']"
            stroke-width="6"
            stroke-linecap="round"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="dashOffset"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="font-mono text-sm font-bold text-foreground">{{ metrics.encryptionRatio }}%</span>
          <span class="text-[9px] font-mono uppercase text-emerald-400">TLS 1.3</span>
        </div>
      </div>

      <div class="flex-1 min-w-0 space-y-2.5">
        <div class="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <svg class="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span class="text-xs font-semibold text-emerald-300 whitespace-nowrap">TLS 1.3 / HTTPS</span>
          </div>
          <code class="font-mono text-[11px] text-emerald-200 truncate">enc: 8f3a9c... (Ilegible para intrusos)</code>
        </div>

        <div class="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <svg class="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            <span class="text-xs font-semibold text-amber-300 whitespace-nowrap">LAN Local :4096</span>
          </div>
          <span class="font-mono text-[11px] text-amber-200 truncate">Texto abierto en red doméstica</span>
        </div>
      </div>
    </div>

    <div class="p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Controles de Defensa Anti-MITM (Clic para ver comando)
        </h4>
        <span class="text-[11px] font-mono text-primary">{{ metrics.encryptedFlows }}/{{ metrics.totalFlows }} seguros</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          v-for="card in defenseCards"
          :key="card.id"
          type="button"
          class="p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-all text-left flex items-center justify-between gap-2 group cursor-pointer"
          @click="onInspect(card.id)"
        >
          <div class="min-w-0">
            <span class="text-[10px] font-mono font-semibold text-primary block">{{ card.code }}</span>
            <span class="text-xs font-semibold text-foreground group-hover:text-primary transition-colors block">
              {{ card.label }}
            </span>
            <span class="text-[11px] text-muted-foreground block truncate">{{ card.sub }}</span>
          </div>
          <svg class="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </AppCard>
</template>
