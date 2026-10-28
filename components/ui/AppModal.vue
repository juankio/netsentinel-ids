<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

interface Props {
  open: boolean
  title: string
  subtitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: undefined
})

const emit = defineEmits<{
  close: []
}>()

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <header class="px-6 py-4 border-b border-border flex items-start justify-between gap-4 bg-muted/30">
          <div>
            <h2 class="text-base font-semibold text-foreground tracking-tight">
              {{ title }}
            </h2>
            <p v-if="subtitle" class="text-xs text-muted-foreground mt-0.5">
              {{ subtitle }}
            </p>
          </div>
          <button
            type="button"
            class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Cerrar modal"
            @click="emit('close')"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </header>

        <div class="p-6 max-h-[75vh] overflow-y-auto">
          <slot name="body" />
          <slot />
        </div>

        <footer
          v-if="$slots.footer"
          class="px-6 py-3.5 border-t border-border bg-muted/20 flex items-center justify-end gap-2"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
