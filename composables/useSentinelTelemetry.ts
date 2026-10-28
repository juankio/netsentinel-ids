import { ref, onUnmounted } from 'vue'
import { useSentinelStore } from '~/stores/sentinel.store'
import type { ScenarioMode, TelemetryPayload, ApiResponse } from '~/types/network'

export function useSentinelTelemetry(pollIntervalMs = 2500) {
  const store = useSentinelStore()
  const isAutoRefresh = ref<boolean>(false)
  let refreshTimerId: ReturnType<typeof setInterval> | null = null
  let requestSequence = 0

  async function fetchTelemetry(
    scenarioOverride?: ScenarioMode,
    silent = false
  ): Promise<TelemetryPayload | null> {
    const requestId = ++requestSequence
    const targetScenario = scenarioOverride ?? store.scenario

    if (!silent) {
      store.setLoading(true)
    }
    store.setError(null)

    try {
      const response = await $fetch<ApiResponse<TelemetryPayload>>('/api/telemetry', {
        method: 'GET',
        query: {
          scenario: targetScenario
        }
      })

      if (requestId !== requestSequence) {
        return null
      }

      if (!response.success || !response.data) {
        store.setError(response.message || 'No fue posible sincronizar la telemetría.')
        return null
      }

      store.hydrateTelemetry(response.data)
      return response.data
    } catch (err) {
      if (requestId === requestSequence) {
        const message = err instanceof Error ? err.message : 'Error de red al consultar telemetría.'
        store.setError(message)
      }
      return null
    } finally {
      if (!silent && requestId === requestSequence) {
        store.setLoading(false)
      }
    }
  }

  async function switchScenario(scenario: ScenarioMode): Promise<TelemetryPayload | null> {
    const requestId = ++requestSequence

    store.setLoading(true)
    store.setError(null)

    try {
      const response = await $fetch<ApiResponse<TelemetryPayload>>('/api/simulate-scenario', {
        method: 'POST',
        body: { scenario }
      })

      if (requestId !== requestSequence) {
        return null
      }

      if (!response.success || !response.data) {
        store.setError(response.message || 'No fue posible cambiar el escenario defensivo.')
        return null
      }

      store.hydrateTelemetry(response.data)
      return response.data
    } catch (err) {
      if (requestId === requestSequence) {
        const message = err instanceof Error ? err.message : 'Error al simular el escenario seleccionado.'
        store.setError(message)
      }
      return null
    } finally {
      if (requestId === requestSequence) {
        store.setLoading(false)
      }
    }
  }

  function stopAutoRefresh() {
    if (refreshTimerId !== null) {
      clearInterval(refreshTimerId)
      refreshTimerId = null
    }
    isAutoRefresh.value = false
  }

  function startAutoRefresh() {
    stopAutoRefresh()
    isAutoRefresh.value = true
    refreshTimerId = setInterval(() => {
      void fetchTelemetry(store.scenario, true)
    }, pollIntervalMs)
  }

  function toggleAutoRefresh() {
    if (isAutoRefresh.value) {
      stopAutoRefresh()
    } else {
      startAutoRefresh()
    }
  }

  onUnmounted(() => {
    stopAutoRefresh()
  })

  return {
    isAutoRefresh,
    fetchTelemetry,
    switchScenario,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh
  }
}
