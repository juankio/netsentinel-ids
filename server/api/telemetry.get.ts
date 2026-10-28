import { defineEventHandler, getQuery, setResponseStatus } from 'h3'
import { okResponse, failResponse } from '../utils/response'
import { ScenarioQuerySchema } from '../utils/schemas'
import { buildTelemetryPayload, getActiveScenario } from '../utils/protocolTelemetry'

export default defineEventHandler((event) => {
  const rawQuery = getQuery(event)
  const parsed = ScenarioQuerySchema.safeParse({
    ...rawQuery,
    scenario: rawQuery.scenario ?? getActiveScenario()
  })

  if (!parsed.success) {
    setResponseStatus(event, 400)
    return failResponse('Parámetros de telemetría inválidos', parsed.error.flatten())
  }

  const { scenario, protocolFilter, search } = parsed.data
  const payload = buildTelemetryPayload(scenario)

  let filteredFlows = payload.flows

  if (protocolFilter && protocolFilter.trim() !== '' && protocolFilter.toUpperCase() !== 'ALL') {
    const normalizedProtocol = protocolFilter.trim().toLowerCase()
    filteredFlows = filteredFlows.filter(
      (flow) => flow.protocol.toLowerCase() === normalizedProtocol
    )
  }

  if (search && search.trim() !== '') {
    const queryTerm = search.trim().toLowerCase()
    filteredFlows = filteredFlows.filter(
      (flow) =>
        flow.sourceIp.toLowerCase().includes(queryTerm) ||
        flow.destinationIp.toLowerCase().includes(queryTerm) ||
        flow.protocol.toLowerCase().includes(queryTerm) ||
        flow.cipherSuite.toLowerCase().includes(queryTerm) ||
        flow.inspectionNote.toLowerCase().includes(queryTerm)
    )
  }

  return okResponse(
    {
      ...payload,
      flows: filteredFlows
    },
    'Telemetría defensiva sincronizada'
  )
})
