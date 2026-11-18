# COACH OS — guía rápida para cambios

App privada de seguimiento de clientes (Miguel, coach online). Español. Next.js 14 App Router + Supabase + Vercel.

## Flujo de trabajo (mínimo coste)
- Cambia solo los archivos necesarios, ejecuta `npm test` y `npx next build`, haz commit y `git push` a `main`.
- Vercel despliega solo desde GitHub. No uses despliegues manuales con archivos inline.
- Cambios de base de datos: nueva migración `supabase/migrations/00N_*.sql` y aplícala con Supabase MCP (proyecto `xriawbiqoejhyysvbwsd`). Nunca borres ni sobrescribas datos históricos.
- No leas todo el repo: usa este mapa.

## Mapa
- `lib/analysis.ts` análisis de check-in (polaridad por métrica en `lib/metrics.ts`).
- `lib/issues.ts` motor de advertencias (estados, resolución por evidencia, orden). `lib/evidence.ts` convierte check-ins / llamadas / sistema en evidencias.
- `lib/achievements.ts` logros y deduplicado. `lib/whatsapp.ts` borradores (nunca se envían).
- `lib/fathom.ts` + `lib/sync/fathom.ts` Fathom (webhook Standard Webhooks, API `api.fathom.ai/external/v1`, asignación por enlace del CRM).
- `lib/sync/engine.ts` `refreshClientAlerts` (recalcula todo de un cliente) y `refreshAll`.
- `lib/sync/crm.ts`, `lib/crm*.ts` CRM Google Sheets; `lib/sync/jotform.ts`, `lib/jotform.ts` Jotform (API UE).
- `app/(app)/*` páginas; `app/actions.ts` acciones del servidor; `app/api/*` webhooks, cron y sync manual.
- `tests/` vitest (lógica pura; los de BD/CRM real se saltan sin variables).

## Reglas del usuario
- No inventar datos ni integraciones; distinguir hecho del cliente / observación del coach / interpretación IA.
- No enviar WhatsApp automáticamente. Datos de salud nunca en borradores ni a servicios externos sin clave explícita.
- No pedir ni imprimir claves; las pone el usuario en Vercel.
