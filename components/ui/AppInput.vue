<script setup lang="ts">
interface Props {
  modelValue: string
  placeholder?: string
  label?: string
}

withDefaults(defineProps<Props>(), {
  placeholder: 'Filtrar...',
  label: undefined
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="block text-xs font-medium text-muted-foreground mb-1.5">
      {{ label }}
    </label>
    <div class="relative flex items-center">
      <svg
        class="w-4 h-4 text-muted-foreground absolute left-3 pointer-events-none"
         viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        :value="modelValue"
        :placeholder="placeholder"
        class="w-full h-9 pl-9 pr-3 text-xs sm:text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-colors"
        @input="onInput"
      />
    </div>
  </div>
</template>
