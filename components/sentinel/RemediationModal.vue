<script setup lang="ts">
import { computed } from 'vue'
import { useSentinelStore } from '~/stores/sentinel.store'
import type { RemediationGuide } from '~/types/network'

interface Props {
  open?: boolean
  guide?: RemediationGuide | null
}

const props = withDefaults(defineProps<Props>(), {
  open: undefined,
  guide: undefined
})

const emit = defineEmits<{
  close: []
}>()

const store = useSentinelStore()

const isOpen = computed(() => props.open ?? store.isRemediationModalOpen)
const activeGuide = computed(() => (props.guide !== undefined ? props.guide : store.activeRemediation))

function onClose() {
  store.closeRemediationModal()
  emit('close')
}
</script>

<template>
  <AppModal
    :open="isOpen && !!activeGuide"
    :title="activeGuide?.title || 'Guía de Remediación Defensiva'"
    :subtitle="activeGuide ? `Capa del Modelo OSI: ${activeGuide.osiLayer} | Categoría: ${activeGuide.category}` : undefined"
    @close="onClose"
  >
    <div v-if="activeGuide" class="space-y-5">
      <div class="p-3.5 rounded-lg bg-muted/40 border border-border">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
          Resumen Técnico del Vector
        </h4>
        <p class="text-xs sm:text-sm text-foreground leading-relaxed">
          {{ activeGuide.summary }}
        </p>
      </div>

      <div>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          Controles Defensivos Paso a Paso (Hardening)
        </h4>
        <ul class="space-y-2">
          <li
            v-for="(control, idx) in activeGuide.defensiveControls"
            :key="idx"
            class="flex items-start gap-2.5 text-xs sm:text-sm text-foreground bg-background/60 p-2.5 rounded-lg border border-border"
          >
            <svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>{{ control }}</span>
          </li>
        </ul>
      </div>

      <div>
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          <svg class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>Comando CLI de Verificación y Auditoría</span>
        </div>
        <pre class="p-3.5 rounded-lg bg-background border border-border font-mono text-xs text-emerald-400 overflow-x-auto">{{ activeGuide.verificationCommand }}</pre>
      </div>
    </div>

    <template #footer>
      <AppButton variant="primary" size="sm" @click="onClose">
        Cerrar Guía Defensiva
      </AppButton>
    </template>
  </AppModal>
</template>
