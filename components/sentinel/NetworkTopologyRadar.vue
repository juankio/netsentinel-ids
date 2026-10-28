<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ArpEntry, PacketHeaderFlow, CryptoPostureMetrics, InterfaceTrafficStat } from '~/types/network'

interface Props {
  arpEntries: ArpEntry[]
  flows: PacketHeaderFlow[]
  metrics: CryptoPostureMetrics
  interfaces: InterfaceTrafficStat[]
}

const props = defineProps<Props>()
type NodeKey = 'pc' | 'mitm' | 'router' | 'lan' | 'internet'
const selectedNode = ref<NodeKey>('mitm')

const gateway = computed(() => props.arpEntries.find((e) => e.isGateway))
const neighbor = computed(() =>
  props.arpEntries.find((e) => !e.isGateway && !e.isStatic && !e.vendor.includes('Este Equipo') && !e.vendor.includes('Host Local'))
)
const hasMitm = computed(() => props.metrics.activeCollisions > 0 || props.metrics.arpIntegrityScore < 100)

const nodeDetails = computed<Record<NodeKey, { title: string; badge: string; kernelData: string; explanation: string }>>(() => ({
  pc: {
    title: 'Tu PC Linux (192.168.1.23 / .26)',
    badge: 'Host Local',
    kernelData: 'Interfaces: enp4s0 (Cable) + wlo1 (Wi-Fi)',
    explanation: 'Tu computador envía y recibe paquetes vigilados directamente desde /proc/net sin agentes externos.'
  },
  mitm: {
    title: 'Escudo Anti-MITM (Capa 2)',
    badge: hasMitm.value ? 'Alerta Colisión' : '100% Íntegro',
    kernelData: `Integridad ARP: ${props.metrics.arpIntegrityScore}% · Colisiones: ${props.metrics.activeCollisions}`,
    explanation: hasMitm.value
      ? 'Atención: se detectó duplicidad de huella MAC en tu red local (posible ARP Spoofing).'
      : 'Enlace físico verificado: ningún intruso intercepta los paquetes entre tu PC y el router.'
  },
  router: {
    title: `Tu Router (${gateway.value?.ipAddress ?? '192.168.1.1'})`,
    badge: 'Gateway Verificado',
    kernelData: `MAC Física: ${gateway.value?.macAddress ?? 'dc:08:da:33:22:90'}`,
    explanation: 'Puerta de enlace hacia Internet con dirección física MAC validada en la tabla ARP del kernel.'
  },
  lan: {
    title: `Vecino LAN (${neighbor.value?.ipAddress ?? '192.168.1.7'})`,
    badge: 'Dispositivo en Casa',
    kernelData: `MAC Vecina: ${neighbor.value?.macAddress ?? 'bc:03:58:a9:aa:49'}`,
    explanation: 'Otro equipo conectado a tu Wi-Fi o red doméstica conviviendo sin suplantar al router.'
  },
  internet: {
    title: 'Internet TLS 1.3 (:443)',
    badge: `${props.metrics.encryptionRatio}% Cifrado`,
    kernelData: `${props.metrics.encryptedFlows}/${props.metrics.totalFlows} túneles con candado TLS`,
    explanation: 'Tráfico saliente hacia servidores web protegido con cifrado autenticado AEAD TLS 1.3.'
  }
}))
</script>

<template>
  <section class="sentinel-panel bg-card/60 border border-border rounded-xl overflow-hidden">
    <div class="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2.5">
        <span class="text-xs font-mono uppercase tracking-wider text-primary font-semibold">Topología en Vivo</span>
        <span class="text-xs text-muted-foreground">· Haz clic en cualquier equipo para inspeccionar su enlace</span>
      </div>
      <span class="text-xs font-mono text-muted-foreground">Cable (enp4s0) + Wi-Fi (wlo1)</span>
    </div>

    <div class="px-4 py-3 bg-background/50">
      <svg viewBox="0 0 1200 270" class="w-full h-auto select-none" role="img" aria-label="Diagrama visual de topología de red">
        <path d="M 225 135 C 300 135, 340 135, 415 135" class="stroke-primary/60" stroke-width="3" stroke-dasharray="7 5" fill="none" />
        <path d="M 585 135 C 650 135, 675 78, 740 78" :class="hasMitm ? 'stroke-rose-400' : 'stroke-emerald-400/80'" stroke-width="3" fill="none" />
        <path d="M 585 135 C 650 135, 675 198, 740 198" class="stroke-border" stroke-width="2.5" stroke-dasharray="5 5" fill="none" />
        <path d="M 910 78 C 960 78, 990 78, 1035 78" class="stroke-emerald-400/80" stroke-width="3" fill="none" />

        <circle r="4" class="topology-packet-dot fill-primary">
          <animateMotion dur="2s" repeatCount="indefinite" path="M 225 135 C 300 135, 340 135, 415 135" />
        </circle>
        <circle r="4" class="topology-packet-dot fill-emerald-400">
          <animateMotion dur="2.1s" repeatCount="indefinite" path="M 585 135 C 650 135, 675 78, 740 78" />
        </circle>
        <circle r="4" class="topology-packet-dot fill-emerald-400">
          <animateMotion dur="1.6s" repeatCount="indefinite" path="M 910 78 C 960 78, 990 78, 1035 78" />
        </circle>

        <g transform="translate(135, 135)" class="cursor-pointer" @click="selectedNode = 'pc'">
          <rect x="-90" y="-58" width="180" height="116" rx="14" :class="['fill-card transition-colors', selectedNode === 'pc' ? 'stroke-primary stroke-2' : 'stroke-border']" />
          <rect x="-22" y="-42" width="44" height="28" rx="4" class="fill-primary/15 stroke-primary" stroke-width="1.8" />
          <path d="M -30 -10 L 30 -10 M -10 -14 L -10 -10 M 10 -14 L 10 -10" class="stroke-primary" stroke-width="2" stroke-linecap="round" />
          <text x="0" y="14" text-anchor="middle" class="fill-foreground text-xs font-bold">Tu PC Linux</text>
          <text x="0" y="32" text-anchor="middle" class="fill-primary font-mono text-[11px]">192.168.1.23 / .26</text>
          <text x="0" y="47" text-anchor="middle" class="fill-muted-foreground font-mono text-[10px]">enp4s0 + wlo1</text>
        </g>

        <g transform="translate(500, 135)" class="cursor-pointer" @click="selectedNode = 'mitm'">
          <rect x="-88" y="-58" width="176" height="116" rx="14" :class="['fill-card transition-colors', selectedNode === 'mitm' ? 'stroke-emerald-400 stroke-2' : 'stroke-border']" />
          <circle cx="0" cy="-26" r="18" class="fill-emerald-500/10 stroke-emerald-400/50" stroke-width="1.5" stroke-dasharray="3 2" />
          <path d="M0 -40 L12 -35 V-25 C12 -17 0 -12 0 -12 C0 -12 -12 -17 -12 -25 V-35 Z" class="fill-emerald-500/20 stroke-emerald-400" stroke-width="1.8" />
          <path d="M-4 -26 L-1 -23 L5 -29" class="stroke-emerald-400" stroke-width="2" fill="none" stroke-linecap="round" />
          <text x="0" y="14" text-anchor="middle" class="fill-foreground text-xs font-bold">Escudo Anti-MITM</text>
          <text x="0" y="32" text-anchor="middle" :class="hasMitm ? 'fill-rose-400' : 'fill-emerald-400'" class="font-mono text-[11px] font-semibold">{{ hasMitm ? 'Colisión MAC' : 'ARP 100% Íntegro' }}</text>
          <text x="0" y="47" text-anchor="middle" class="fill-muted-foreground font-mono text-[10px]">Inspección Capa 2</text>
        </g>

        <g transform="translate(825, 78)" class="cursor-pointer" @click="selectedNode = 'router'">
          <rect x="-85" y="-54" width="170" height="108" rx="14" :class="['fill-card transition-colors', selectedNode === 'router' ? 'stroke-primary stroke-2' : 'stroke-border']" />
          <path d="M-14 -22 L-20 -38 M14 -22 L20 -38" class="stroke-primary" stroke-width="2" stroke-linecap="round" />
          <path d="M-8 -34 A 12 12 0 0 1 8 -34" class="stroke-emerald-400" stroke-width="1.6" fill="none" stroke-linecap="round" />
          <rect x="-24" y="-22" width="48" height="16" rx="4" class="fill-primary/15 stroke-primary" stroke-width="1.8" />
          <circle cx="-12" cy="-14" r="2" class="fill-emerald-400" /><circle cx="-4" cy="-14" r="2" class="fill-emerald-400" />
          <text x="0" y="14" text-anchor="middle" class="fill-foreground text-xs font-bold">Tu Router {{ gateway?.ipAddress ?? '192.168.1.1' }}</text>
          <text x="0" y="31" text-anchor="middle" class="fill-muted-foreground font-mono text-[10px]">{{ gateway?.macAddress ?? 'dc:08:da:33:22:90' }}</text>
          <text x="0" y="45" text-anchor="middle" class="fill-emerald-400 font-mono text-[10px]">Gateway Verificado</text>
        </g>

        <g transform="translate(825, 198)" class="cursor-pointer" @click="selectedNode = 'lan'">
          <rect x="-85" y="-50" width="170" height="100" rx="14" :class="['fill-card transition-colors', selectedNode === 'lan' ? 'stroke-primary stroke-2' : 'stroke-border']" />
          <rect x="-11" y="-38" width="22" height="30" rx="4" class="fill-muted stroke-muted-foreground" stroke-width="1.8" />
          <circle cx="0" cy="-13" r="1.5" class="fill-foreground" />
          <text x="0" y="12" text-anchor="middle" class="fill-foreground text-xs font-bold">Vecino {{ neighbor?.ipAddress ?? '192.168.1.7' }}</text>
          <text x="0" y="28" text-anchor="middle" class="fill-muted-foreground font-mono text-[10px]">{{ neighbor?.macAddress ?? 'bc:03:58:a9:aa:49' }}</text>
          <text x="0" y="42" text-anchor="middle" class="fill-muted-foreground font-mono text-[10px]">Dispositivo en Casa</text>
        </g>

        <g transform="translate(1110, 78)" class="cursor-pointer" @click="selectedNode = 'internet'">
          <rect x="-75" y="-54" width="150" height="108" rx="14" :class="['fill-card transition-colors', selectedNode === 'internet' ? 'stroke-emerald-400 stroke-2' : 'stroke-border']" />
          <rect x="-12" y="-26" width="24" height="18" rx="3" class="fill-emerald-500/20 stroke-emerald-400" stroke-width="1.8" />
          <path d="M-7 -26 V-32 A 7 7 0 0 1 7 -32 V-26" class="stroke-emerald-400" stroke-width="1.8" fill="none" />
          <text x="0" y="14" text-anchor="middle" class="fill-foreground text-xs font-bold">Internet TLS 1.3 :443</text>
          <text x="0" y="31" text-anchor="middle" class="fill-emerald-400 font-mono text-[11px] font-semibold">{{ metrics.encryptionRatio }}% Cifrado</text>
          <text x="0" y="45" text-anchor="middle" class="fill-muted-foreground font-mono text-[10px]">Túneles HTTPS Seguros</text>
        </g>
      </svg>
    </div>

    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20">
      <div class="flex flex-wrap items-center gap-2 min-w-0">
        <span class="text-xs font-bold text-foreground">{{ nodeDetails[selectedNode].title }}</span>
        <AppBadge :variant="hasMitm && selectedNode === 'mitm' ? 'danger' : 'success'">{{ nodeDetails[selectedNode].badge }}</AppBadge>
        <span class="text-xs text-muted-foreground truncate">{{ nodeDetails[selectedNode].explanation }}</span>
      </div>
      <span class="font-mono text-xs px-2.5 py-1 rounded bg-background/80 border border-border text-foreground shrink-0">{{ nodeDetails[selectedNode].kernelData }}</span>
    </div>
  </section>
</template>
