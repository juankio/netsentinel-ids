import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { okResponse, failResponse } from '../utils/response'
import { SimulateScenarioBodySchema } from '../utils/schemas'
import { buildTelemetryPayload, setActiveScenario } from '../utils/protocolTelemetry'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  const parsed = SimulateScenarioBodySchema.safeParse(body)

  if (!parsed.success) {
    setResponseStatus(event, 400)
    return failResponse(
      'Payload de escenario inválido. Use baseline, arp_spoof_detected o cleartext_exposure.',
      parsed.error.flatten()
    )
  }

  setActiveScenario(parsed.data.scenario)
  const payload = buildTelemetryPayload(parsed.data.scenario)

  return okResponse(payload, 'Escenario de laboratorio actualizado')
})
