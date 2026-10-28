<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'primary'
  pulse?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  pulse: false
})

const badgeClasses = computed(() => {
  const map: Record<NonNullable<Props['variant']>, string> = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    primary: 'bg-primary/10 text-primary border-primary/20',
    neutral: 'bg-muted text-muted-foreground border-border'
  }
  return map[props.variant]
})

const dotClasses = computed(() => {
  const map: Record<NonNullable<Props['variant']>, string> = {
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    danger: 'bg-rose-400',
    primary: 'bg-primary',
    neutral: 'bg-muted-foreground'
  }
  return map[props.variant]
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border tracking-wide whitespace-nowrap shrink-0',
      badgeClasses
    ]"
  >
    <span
      v-if="props.pulse"
      :class="['w-1.5 h-1.5 rounded-full animate-pulse', dotClasses]"
    />
    <slot />
  </span>
</template>
