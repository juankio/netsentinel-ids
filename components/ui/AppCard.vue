<script setup lang="ts">
interface Props {
  title?: string
  subtitle?: string
  noPadding?: boolean
}

withDefaults(defineProps<Props>(), {
  title: undefined,
  subtitle: undefined,
  noPadding: false
})
</script>

<template>
  <section class="bg-card border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
    <header
      v-if="title || subtitle || $slots.header || $slots.actions"
      class="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-muted/20"
    >
      <div class="flex items-center gap-3 min-w-0">
        <slot name="header">
          <div>
            <h3 v-if="title" class="text-sm font-semibold tracking-tight text-foreground">
              {{ title }}
            </h3>
            <p v-if="subtitle" class="text-xs text-muted-foreground mt-0.5">
              {{ subtitle }}
            </p>
          </div>
        </slot>
      </div>
      <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0">
        <slot name="actions" />
      </div>
    </header>

    <div :class="[noPadding ? '' : 'p-5', 'flex-1']">
      <slot />
    </div>

    <footer
      v-if="$slots.footer"
      class="px-5 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground"
    >
      <slot name="footer" />
    </footer>
  </section>
</template>
