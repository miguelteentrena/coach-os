# COACH OS 2.0

Centro de inteligencia del negocio de entrenamiento online. Complementa (no sustituye) el CRM de Google Sheets, Jotform, Harbiz y FatSecret.

## Estado (18/11/2026)

| Pieza | Estado |
|---|---|
| Modelo de datos, RLS, vista de días | **Implementado y probado** en Postgres 16 real con el CRM real |
| Importación y sincronización del CRM | **Implementado** (Apps Script + webhook firmado, respaldo diario por Sheets API). Pendiente: desplegar y pegar el script |
| Check-ins de Jotform | **Implementado** (webhook, histórico y reconciliación por API). Pendiente: clave de API. **El histórico (11 envíos) aún no se ha importado**: el conector de Claude no devuelve el contenido de los envíos |
| Análisis, semáforo, alertas, renovaciones, WhatsApp | **Implementado y probado** con tests unitarios |
| Interfaz (8 secciones) | **Implementada**; compila y responde. Sin datos hasta conectar Supabase |
| Harbiz, FatSecret, envío de WhatsApp | **Fuera de alcance** (no hay integración; nunca se envían mensajes) |

## Arquitectura

- **Next.js 14 (App Router) en Vercel (región París)**: interfaz y rutas de servidor en un solo proyecto. Las claves solo existen en variables de servidor.
- **Supabase (región UE)**: Postgres + Auth (enlace mágico, sin registro abierto) + RLS (solo usuarios en `coach_users`).
- **Sin IA externa para datos de salud**: análisis y mensajes se generan con reglas locales (`lib/analysis.ts`, `lib/whatsapp.ts`).

```
CRM (Sheets) ──Apps Script (al editar + cada hora, HMAC)──▶ /api/webhooks/crm ─┐
            └─Sheets API (cron diario, solo lectura)────────────────────────────┤
Jotform ──webhook (cada envío)──▶ /api/webhooks/jotform ──▶ relee por API ──────┼─▶ Supabase ─▶ análisis/alertas/WhatsApp
        └─API (histórico + reconciliación 21 días, cron diario)─────────────────┘
```

Los días transcurridos/restantes **no se almacenan**: la vista `program_status` los calcula con `current_date` en cada consulta (más pausas/extensiones registradas en COACH OS). No se usa la columna «Días desde el inicio» del CRM porque mezcla la fórmula con el texto «FINALIZADO».

## Puesta en marcha

1. **Supabase** (región UE): crea el proyecto y ejecuta `supabase/migrations/001_coach_os.sql` en el editor SQL.
   - Authentication → desactiva «Allow new users to sign up».
   - Crea tu usuario (Authentication → Users → Invite) y autorízalo:
     `insert into coach_users (user_id, email) values ('<uuid>', 'miguelteentrena@gmail.com');`
2. **Vercel**: importa este proyecto y copia las variables de `.env.example`.
3. **CRM**: en la hoja → Extensiones → Apps Script → pega `apps-script/CoachOS_CRM_Sync.gs`, añade el servicio avanzado *Google Sheets API*, define `COACHOS_URL` y `COACHOS_SECRET` en Propiedades del script y ejecuta `instalar()`. El primer envío importa todo el CRM.
4. **Jotform**: Configuración → API → crea una clave (solo lectura) → `JOTFORM_API_KEY`.
   - Formulario «Check-in semanal» → Configuración → Integraciones → WebHooks → `https://<app>/api/webhooks/jotform?token=<JOTFORM_WEBHOOK_TOKEN>`.
   - En COACH OS → Configuración → «Importar histórico de Jotform».
   - Recomendado: añadir un campo de email (o campo oculto precargado) al formulario. Hoy solo hay «Nombre y Apellido»; los nombres que no coinciden exactamente con el CRM van a revisión manual (nunca se autocorrigen).
5. **Copias de seguridad**: plan Pro de Supabase (copias diarias) y/o `scripts/backup.sh` (pg_dump cifrado con AES-256). El CRM y Jotform siguen siendo fuentes recuperables.

## Pruebas

```
npm test                                   # lógica (fechas, CRM, Jotform, análisis, alertas) + SQL/RLS en PGlite
CRM_CSV=<export.csv> npm test              # + parser con el CRM real
PG_URL=<postgres> CRM_CSV=<export.csv> npm test  # + importación real en Postgres 16 y RLS
npm run build
```
Los datos sintéticos de `tests/` solo se usan en las pruebas; la app nunca muestra datos simulados.
