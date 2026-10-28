<div align="center">

# NetSentinel IDS

**IDS pasivo para integridad ARP y postura criptográfica en redes locales.**
Lee el kernel Linux, detecta colisiones MAC y flujos sin TLS, muestra el resultado en un dashboard en vivo.

![Nuxt](https://img.shields.io/badge/Nuxt-3.13.2-00DC82?style=flat-square&logo=nuxtdotjs&logoColor=white)
![Pinia](https://img.shields.io/badge/Pinia-2.1.7-FFD859?style=flat-square)
![Anime.js](https://img.shields.io/badge/Anime.js-3.2.2-FF4B4B?style=flat-square)
![Zod](https://img.shields.io/badge/Zod-3.23.8-3E67B1?style=flat-square)
![Vitest](https://img.shields.io/badge/Vitest-2.1.9-6E9F18?style=flat-square)
![Tests](https://img.shields.io/badge/tests-5%20passed-brightgreen?style=flat-square)
![Plataforma](https://img.shields.io/badge/plataforma-Linux-333333?style=flat-square&logo=linux&logoColor=white)
![Postura](https://img.shields.io/badge/postura-100%25%20defensiva-0f766e?style=flat-square)

</div>

---

## Postura ética

NetSentinel es un laboratorio de auditoría defensiva. No ataca, no inyecta y no intercepta.

- **Solo lectura.** Los sensores abren `/proc/net/arp`, `/proc/net/route`, `/proc/net/dev`, `/proc/net/tcp`, `/proc/net/udp`, `/proc/net/tcp6` y `/proc/net/udp6`. Nada más.
- **Sin sockets crudos de transmisión.** El proyecto no importa `node:dgram`, `node:net` ni librerías de captura. No existe código capaz de emitir una trama.
- **Sin generación de tráfico ofensivo.** El escenario `arp_spoof_detected` no envía un ARP gratuito: añade una fila en memoria con la MAC del gateway y deja que el motor de detección la evalúe. Lo mismo con `cleartext_exposure`, que inyecta dos objetos `PacketHeaderFlow` en el array de respuesta.
- **Uso previsto.** Verificar la integridad de tu propio segmento, documentar deriva de gateway y auditar qué protocolos salen sin cifrado. Todo sobre redes propias o con autorización escrita.

Si necesitas el vector ofensivo, esta herramienta no lo tiene. Y no lo tendrá.

---

## Qué detecta

| Vector | Capa OSI | Mecanismo implementado | Severidad | Mitigación |
| :--- | :--- | :--- | :--- | :--- |
| ARP Spoofing / Poisoning | 2, Enlace | Agrupa IPs por MAC normalizada. Si una MAC reclama más de una IP, todas sus filas pasan a `collision` y se emite una alerta `ARP_SPOOFING`. | `critical` | `rem-dai` |
| Gateway Drift | 2 y 3 | Compara la MAC de la entrada marcada `isGateway` contra la MAC de referencia del payload (`trustedGatewayMac`). También conserva las filas que ya llegan con `status: gateway_drift`. | `high` | `rem-static-arp` |
| Cleartext HTTP / FTP | 6 y 7 | Flujos simulados en puertos 80 y 21 se emiten como `HTTP` y `FTP` con `encrypted: false`. Un socket real del kernel que no coincide con ningún puerto cifrado también cae en `HTTP`. | `high` (simulado) / `medium` (kernel) | `rem-tls13` |
| DNS sin cifrar | 7 | Consulta `DNS` con `encrypted: false` (UDP/53). DoT en 853 y mDNS en 5353 se clasifican como cifrados y no alertan. | `medium` | `rem-dnssec` |

**Score de integridad ARP.** Arranca en 100. Cada MAC en colisión resta 45 puntos. La deriva de gateway resta 25. El resultado se recorta al rango 0 a 100.

**Alcance de la deriva.** `buildScenarioArpEntries()` recalcula la MAC de referencia en cada lectura, así que la deriva solo salta si la fila del gateway llega con una MAC distinta a esa referencia o con estado `gateway_drift`. El valor global `TRUSTED_GATEWAY_MAC` se fija al importar el módulo y sirve de respaldo cuando `/proc/net/arp` no tiene la fila del gateway.

**Postura global.** `CRITICAL_ALERT` si hay colisiones activas o el score cae por debajo de 60. `DEGRADED` si existe al menos un flujo en texto claro o el score no llega a 100. `SECURE` en cualquier otro caso.

**Clasificación de sockets.** 443 y 8443 salen como `TLSv1.3` o `HTTPS` y cifrados. 22 como `SSHv2`. 853 como `DNSSEC`. Los puertos 67, 68, 546 y 547 se tratan como DHCP. 53 queda como `DNS` sin cifrar. 5353 como mDNS seguro. Loopback se marca cifrado. Cualquier otro socket abierto se reporta como `HTTP` sin cifrar.

---

## Arquitectura

```
┌──────────────────────────── Navegador (SPA, ssr: false) ─────────────────────────────┐
│  pages/index.vue                                                                     │
│    ├─ SentinelKpiRow        4 KPIs + filtros de interfaz + toggle En Vivo (2.5 s)    │
│    ├─ NetworkTopologyRadar  nodos PC / escudo MITM / router / LAN / Internet         │
│    ├─ ArpDefenseTable       vecinos ARP agrupados por IP + alertas de Capa 2         │
│    ├─ CryptoPosturePanel    ratio de cifrado + catálogo de remediaciones             │
│    ├─ ProtocolTelemetryFeed flujos TCP/UDP con chips de protocolo y buscador         │
│    └─ RemediationModal      controles de hardening y comando de verificación         │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                                        │ useSentinelMotion (anime.js, respeta
                                        │ prefers-reduced-motion)
                                        ▼
                     composables/useSentinelTelemetry.ts
                     $fetch /api/telemetry · /api/simulate-scenario
                                        │
                                        ▼
                     stores/sentinel.store.ts (Pinia)
                     arpEntriesById · alertsById · flowsById · remediationsById
                                        │
                                        ▼
                     Nitro: server/api/*.ts + Zod (server/utils/schemas.ts)
                                        │
                                        ▼
        server/utils/protocolTelemetry.ts  ──►  server/utils/arpInspector.ts
                                        │
        ┌───────────────┬───────────────┼────────────────┬──────────────────┐
        ▼               ▼               ▼                ▼                  ▼
  /proc/net/arp   /proc/net/route  /proc/net/dev   /proc/net/tcp|tcp6  /proc/net/udp|udp6
   vecinos ARP     gateway + iface   RX/TX y drops   sockets TCP         sockets UDP
```

```
netsentinel-ids/
├── app.vue                  # Monta NuxtLayout + NuxtPage, nada más
├── nuxt.config.ts           # ssr: false, Tailwind + Pinia, fuentes y meta del dashboard
├── tailwind.config.js       # Tokens HSL (primary, card, border, muted) sobre variables CSS
├── assets/css/main.css      # Define las variables de tema y la tipografía base
├── layouts/default.vue      # Header con badge de postura, slot central y footer con la fuente de datos
├── pages/index.vue          # Única ruta, compone los seis paneles (58 líneas)
├── components/ui/           # AppButton, AppCard, AppInput, AppBadge, AppModal con slots
├── components/sentinel/     # Paneles de dominio: radar, tabla ARP, feed, KPIs, modal
├── composables/             # useSentinelTelemetry (fetch + polling) y useSentinelMotion (anime.js)
├── stores/sentinel.store.ts # Estado normalizado por id, selectores computados y filtros
├── server/api/              # GET /api/telemetry y POST /api/simulate-scenario
├── server/utils/            # Sensores /proc, motor de scoring, esquemas Zod, envelope HTTP
├── types/network.ts         # Contratos ArpEntry, IdsAlert, PacketHeaderFlow, TelemetryPayload
└── tests/                   # Vitest sobre el motor defensivo y los esquemas de validación
```

El store guarda diccionarios `Record<string, T>` y evita duplicados. Los flujos se filtran en dos sitios: en Nitro, si llegan `protocolFilter` o `search` por query; y en el cliente, con `selectedProtocol` y `searchQuery` del store.

---

## API

Envelope común para todas las respuestas. Lo genera `server/utils/response.ts`.

```json
{
  "success": true,
  "data": { "scenario": "baseline", "metrics": { "arpIntegrityScore": 100 } },
  "message": "Telemetría defensiva sincronizada",
  "error": null
}
```

| Método | Ruta | Parámetros reales | Respuesta |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/telemetry` | `scenario` (`baseline` \| `arp_spoof_detected` \| `cleartext_exposure`; el proceso arranca con `baseline` en memoria), `protocolFilter` (comparación exacta sin distinguir mayúsculas; `ALL` o vacío no filtra), `search` (substring sobre IP origen, IP destino, protocolo, `cipherSuite` e `inspectionNote`) | `TelemetryPayload` con `flows` filtrados |
| `POST` | `/api/simulate-scenario` | Body JSON `{ "scenario": "..." }` validado con Zod | `TelemetryPayload` completo y fija el escenario en el proceso Nitro |

Errores de validación devuelven HTTP 400 con `success: false`, `data: null` y `error` con el `flatten()` de Zod.

```bash
# Telemetría completa del escenario activo
curl -s http://localhost:3090/api/telemetry | jq '.data.metrics'

# Filtrado por protocolo (HTTPS exacto, sin distinguir mayúsculas)
curl -s "http://localhost:3090/api/telemetry?scenario=baseline&protocolFilter=HTTPS" | jq '.data.flows'

# Búsqueda textual (substring en IP, protocolo, suite o nota; no busca puertos)
curl -s "http://localhost:3090/api/telemetry?scenario=baseline&search=192.168.44.1" | jq '.data.flows'

# Cambiar de escenario en el servidor
curl -s -X POST http://localhost:3090/api/simulate-scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"arp_spoof_detected"}' | jq '.data.alerts'

# Un escenario inexistente devuelve 400
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3090/api/simulate-scenario \
  -H 'Content-Type: application/json' -d '{"scenario":"offensive_mode"}'
```

`AcknowledgeAlertBodySchema` está declarado en `server/utils/schemas.ts`, pero hoy ninguna ruta lo consume: no existe endpoint de reconocimiento de alertas.

---

## Escenarios de laboratorio

Los tres valores del `ScenarioEnum` son los únicos aceptados. Cualquier otro string produce 400.

| Escenario | Qué cambia respecto a `baseline` | Efecto medible |
| :--- | :--- | :--- |
| `baseline` | Nada. Devuelve la tabla ARP real, las interfaces de `/proc/net/dev` y los sockets activos del kernel. | Score 100 si no hay anomalías reales. Flujos máximo 20, sin el puerto 3090 del propio dashboard. |
| `arp_spoof_detected` | Añade una fila con IP `<subred>.250` y la MAC del gateway, proveedor "Nodo Intruso Detectado (Colisión MAC con Gateway)". Antepone un flujo ARP simulado hacia el gateway. | `activeCollisions` ≥ 1, score 55, alerta `ARP_SPOOFING` crítica, postura `CRITICAL_ALERT`. |
| `cleartext_exposure` | Antepone dos flujos: HTTP/80 con 15 820 bytes y FTP/21 con 4 120 bytes, ambos desde `<subred>.23` hacia `<subred>.7`. | Dos alertas `CLEARTEXT_PROTOCOL` de severidad alta, `encryptionRatio` por debajo de 100, postura `DEGRADED`. |

Los escenarios no tocan la red. Todo ocurre en el array que devuelve `buildTelemetryPayload()`.

---

## Instalación y uso

Requisitos: Bun (hay `bun.lock` en la raíz) y Linux, porque los sensores leen `/proc`. En macOS o Windows arranca, pero sin tabla ARP real ni sockets del kernel.

```bash
bun install          # instala y ejecuta nuxt prepare
bun run dev          # servidor de desarrollo en http://localhost:3090
bun run build        # bundle de producción con Nitro
bun run test         # suite de Vitest
bun run generate     # sitio estático, si lo necesitas
```

**Fallback cuando `/proc` no está disponible.** `readSystemProcArp()` captura la excepción y devuelve `rows: []` con `interfaceSource: "Linux Kernel /proc/net/arp (unavailable)"`. La tabla ARP se llena entonces con las interfaces locales que reporta `os.networkInterfaces()`, marcadas como estáticas y confiables. `readDefaultGatewayFromRoute()` cae a `192.168.1.1` con las interfaces `enp4s0` y `wlo1`, y `TRUSTED_GATEWAY_MAC` usa `dc:08:da:33:22:90` si no encontró la fila del gateway. No hay sensor simulado ni datos de relleno: si el kernel no expone nada, la pantalla lo dice.

---

## Estructura de tests

Un archivo, cinco casos, sobre el motor del servidor y sin levantar Nuxt. `tests/defensive-engine.spec.ts`.

1. `detectArpAnomalies()` marca la colisión MAC entre gateway e intruso, emite `ARP_SPOOFING` crítica con `sourceIp` del atacante y `mitigationId: rem-dai`.
2. `baseline` real del kernel devuelve score 100, cero colisiones y cero alertas.
3. `buildTelemetryPayload('baseline')` trae interfaces de `/proc/net/dev`, tabla ARP y flujos, sin tráfico del puerto 3090 y con máximo dos flujos loopback.
4. `cleartext_exposure` recalcula `encryptionRatio` con la fórmula del código, genera al menos dos alertas `CLEARTEXT_PROTOCOL` y verifica que cada `mitigationId` apunte a una remediación existente.
5. Los tres esquemas Zod aceptan los escenarios válidos, rechazan `offensive_mode`, rechazan body vacío, aplican el default `baseline` en query y exigen `alertId` no vacío.

Salida real de la última ejecución:

```
 RUN  v2.1.9 /home/juankio/Proyectos/netsentinel-ids

 ✓ tests/defensive-engine.spec.ts (5 tests) 66ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  1.33s
```

Los casos 2 y 3 leen el kernel de la máquina donde corren. En un contenedor sin `/proc/net/arp` poblado, esas aserciones fallan por entorno, no por lógica.

---

## Memoria del proyecto

La nota canónica vive en el vault de Obsidian:

[`20-Ejecucion/netsentinel-ids/README-NetSentinel-IDS.md`](/home/juankio/Obsidian/MiVault/20-Ejecucion/netsentinel-ids/README-NetSentinel-IDS.md)

Leyes arquitectónicas que gobiernan este repositorio:

- [[Estructura-Carpetas-Nuxt]] para la separación `components/ui`, `components/<feature>`, `composables`, `stores`, `server`.
- [[Arquitectura-Estado-Pinia]] para el estado normalizado por id y los selectores computados.
- [[Arquitectura-Componentes-Globales-UI]] para las primitivas de `components/ui`.

---

## Git

Modelo Safe-Nav de tres ramas. Nada de ramas efímeras por feature.

| Rama | Rol |
| :--- | :--- |
| `dev` | Desarrollo activo. Aquí se hacen los cambios y los commits atómicos. |
| `test` | Staging y QA. Se valida antes de promover. |
| `main` | Release. Solo recibe merges desde `test`, nunca push directo. |

Remoto: `origin` → `github.com/juankio/netsentinel-ids`.

```bash
git checkout dev
git add -A && git commit -m "feat(ids): ..."
git push origin dev
```
