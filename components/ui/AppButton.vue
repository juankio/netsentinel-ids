<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  active?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  active: false,
  type: 'button'
})

const variantClasses = computed(() => {
  if (props.active) {
    return 'bg-primary text-primary-foreground border-primary shadow-sm ring-1 ring-primary/40'
  }
  const map: Record<NonNullable<Props['variant']>, string> = {
    primary: 'bg-primary text-primary-foreground border-transparent hover:bg-primary/90 shadow-sm',
    secondary: 'bg-muted text-foreground border-border hover:bg-muted/80 hover:border-primary/40',
    outline: 'bg-transparent text-foreground border-border hover:bg-muted/60 hover:border-primary/40',
    ghost: 'bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
  }
  return map[props.variant]
})

const sizeClasses = computed(() => {
  const map: Record<NonNullable<Props['size']>, string> = {
    sm: 'h-8 px-2.5 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-xs sm:text-sm gap-2',
    lg: 'h-10 px-4 text-sm gap-2.5'
  }
  return map[props.size]
})
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    :class="[
      'inline-flex items-center justify-center font-medium rounded-lg border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer whitespace-nowrap shrink-0',
      variantClasses,
      sizeClasses
    ]"
  >
    <slot name="icon" />
    <slot />
  </button>
</template>
