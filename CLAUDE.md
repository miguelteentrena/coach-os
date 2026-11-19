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
- `lib/fatsecret.ts` (firma OAuth 1.0, parsers, medias) + `lib/sync/fatsecret.ts` (autorización y sincronización); enlace público `app/conectar/fatsecret/[invite]`, vuelta en `app/api/fatsecret/callback`; página `app/(app)/nutricion`; tarjeta `components/FatsecretCard.tsx`.
- Medidas corporales: tabla `measurements` (llamadas, Jotform, FatSecret), página Evolución.
- `tests/` vitest (lógica pura; los de BD/CRM real se saltan sin variables).

## Reglas del usuario
- No inventar datos ni integraciones; distinguir hecho del cliente / observación del coach / interpretación IA.
- No enviar WhatsApp automáticamente. Datos de salud nunca en borradores ni a servicios externos sin clave explícita.
- No pedir ni imprimir claves; las pone el usuario en Vercel.

## FatSecret + Nutrición (hecho 19/11/2026; especificación original)
- Conexión: OAuth 1.0 de 3 patas (authentication.fatsecret.com). Claves de la app en Vercel: `FATSECRET_CONSUMER_KEY`, `FATSECRET_CONSUMER_SECRET`. Enlace único por cliente desde su ficha (un solo uso); token y secreto guardados por cliente; sincronización nocturna en el cron (food_entries.get_month + weights.get_month). Mostrar en ficha/Configuración quién está conectado y la última sincronización; botón para desconectar. Verificar primero que la edición Basic permite leer diarios.
- Apartado **Nutrición** dentro de cada cliente, lo más visual e intuitivo posible:
  - Selector **Día / Semana / Mes**.
  - **Barras** de calorías (por día en la vista semanal y mensual; media semanal en la mensual), con línea de su objetivo calórico si existe.
  - **Gráfico circular (donut)** del reparto de macros (proteína / carbohidratos / grasa, en g y %) del periodo elegido.
  - Vista diaria: comidas del día (desayuno, comida, cena, otros) con kcal y macros.
  - Comparativa semana a semana (media kcal y macros vs semana anterior) para analizar la evolución.
  - Días sin registrar se muestran como huecos, nunca como 0 kcal.
- Mismo estilo de la app (oscuro, acento lima). Datos de salud: solo lectura, nunca en borradores de WhatsApp.
