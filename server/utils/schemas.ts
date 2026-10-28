import { z } from 'zod'

export const ScenarioEnum = z.enum([
  'baseline',
  'arp_spoof_detected',
  'cleartext_exposure'
])

export const ScenarioQuerySchema = z.object({
  scenario: ScenarioEnum.default('baseline'),
  protocolFilter: z.string().optional(),
  search: z.string().optional()
})

export const SimulateScenarioBodySchema = z.object({
  scenario: ScenarioEnum
})

export const AcknowledgeAlertBodySchema = z.object({
  alertId: z.string().min(1)
})
