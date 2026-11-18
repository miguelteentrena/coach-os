import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { nameKey } from './normalize';

/** Fathom External API (https://api.fathom.ai/external/v1) — verificado en developers.fathom.ai:
 *  - Webhook «New meeting content ready» firmado con Standard Webhooks:
 *    cabeceras webhook-id / webhook-timestamp / webhook-signature («v1,<base64>» separadas por espacio),
 *    contenido firmado `${id}.${timestamp}.${body}`, HMAC-SHA256 con el secreto (parte tras «whsec_», en base64).
 *  - El webhook se envía UNA vez por grabación: la reconciliación diaria por API cubre lo que se pierda. */

export function verifyFathomWebhook(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, rawBody: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    try { const b = Buffer.from(sig, 'base64'); return b.length === expected.length && timingSafeEqual(b, expected); } catch { return false; }
  });
}

export interface FathomMeeting {
  recordingId: number;
  title: string | null;
  recordedAt: string;
  url: string | null;
  shareUrl: string | null;
  inviteeEmails: string[];
  summaryMd: string | null;
  actionItems: { description: string; assigneeName: string | null; assigneeEmail: string | null; completed: boolean; timestampSec: number | null; link: string | null }[];
}

const hms = (s: unknown): number | null => {
  if (typeof s === 'number') return s;
  if (typeof s !== 'string') return null;
  const p = s.split(':').map(Number);
  return p.some(isNaN) ? null : p.reduce((acc, n) => acc * 60 + n, 0);
};

/** Acepta el objeto Meeting de GET /meetings y el payload del webhook (misma forma). */
export function parseMeeting(m: any): FathomMeeting {
  return {
    recordingId: Number(m.recording_id ?? m.recordingId),
    title: m.title ?? m.meeting_title ?? null,
    recordedAt: m.recording_start_time ?? m.scheduled_start_time ?? m.created_at,
    url: m.url ?? null,
    shareUrl: m.share_url ?? null,
    inviteeEmails: (m.calendar_invitees ?? []).map((i: any) => String(i.email ?? '').toLowerCase()).filter(Boolean),
    summaryMd: m.default_summary?.markdown_formatted ?? (typeof m.default_summary === 'string' ? m.default_summary : null),
    actionItems: (m.action_items ?? []).map((a: any) => ({
      description: String(a.description ?? '').trim(),
      assigneeName: a.assignee?.name ?? null,
      assigneeEmail: a.assignee?.email ? String(a.assignee.email).toLowerCase() : null,
      completed: !!a.completed,
      timestampSec: hms(a.recording_timestamp),
      link: a.recording_playback_url ?? null,
    })).filter((a: any) => a.description),
  };
}

/** Normaliza enlaces de Fathom para compararlos con los del CRM. */
export function normFathomUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const m = u.trim().match(/fathom\.video\/(share(?:\/[hipu])?|calls)\/([A-Za-z0-9_-]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export interface CrmCallLinks { clientId: string; email: string | null; urls: string[] }
export type CallMatch = { clientId: string; method: 'crm_link' | 'invitee_email' } | null;

/** Asignación: 1) enlace pegado en el CRM (la vía fiable: las llamadas «Impromptu» no tienen invitados);
 *  2) email de invitado = email del cliente. Nunca por parecido de nombre. */
export function matchCall(m: Pick<FathomMeeting, 'url' | 'shareUrl' | 'inviteeEmails'>, crm: CrmCallLinks[], coachEmails: string[]): CallMatch {
  const keys = [normFathomUrl(m.shareUrl), normFathomUrl(m.url)].filter(Boolean) as string[];
  const byLink = crm.filter((c) => c.urls.some((u) => keys.includes(normFathomUrl(u) ?? '')));
  if (byLink.length === 1) return { clientId: byLink[0].clientId, method: 'crm_link' };
  if (byLink.length > 1) return null; // ambiguo → revisión manual
  const guests = m.inviteeEmails.filter((e) => !coachEmails.includes(e));
  const byEmail = crm.filter((c) => c.email && guests.includes(c.email));
  return byEmail.length === 1 ? { clientId: byEmail[0].clientId, method: 'invitee_email' } : null;
}

export const fingerprint = (...parts: (string | number | null | undefined)[]) =>
  createHash('sha1').update(parts.map((p) => (p == null ? '' : nameKey(String(p)))).join('|')).digest('hex').slice(0, 20);

// ───────── Extracción con IA (opcional: solo si hay ANTHROPIC_API_KEY) ─────────
export const INSIGHT_KINDS = ['problem', 'goal', 'life_change', 'availability', 'adherence', 'doubt', 'client_commitment', 'coach_commitment', 'progress', 'achievement', 'incident', 'health'] as const;
export const ISSUE_CATEGORIES = ['training_adherence', 'nutrition_adherence', 'fatigue_recovery', 'hunger', 'hydration', 'sleep', 'stress', 'motivation', 'stagnation', 'health_comment', 'availability', 'life_situation'] as const;

export interface ExtractedInsight {
  kind: (typeof INSIGHT_KINDS)[number];
  speaker: 'client' | 'coach' | 'unknown';
  text: string;
  quote?: string | null;
  timestamp_sec?: number | null;
  issue_category?: (typeof ISSUE_CATEGORIES)[number] | null;
  polarity: 'problem' | 'improvement' | 'neutral';
  sensitive?: boolean;
}

/** Comprueba que cada cita existe literalmente en la transcripción; si no, se degrada a inferencia sin cita. */
export function validateQuotes(items: ExtractedInsight[], transcript: string): (ExtractedInsight & { basis: 'verbatim_quote' | 'ai_inference' })[] {
  const T = nameKey(transcript);
  return items.map((i) => {
    const q = i.quote?.trim();
    const ok = !!q && q.length >= 8 && T.includes(nameKey(q));
    return { ...i, quote: ok ? q!.slice(0, 200) : null, basis: ok ? 'verbatim_quote' : 'ai_inference' };
  });
}

export const EXTRACTION_SYSTEM = `Eres un asistente que extrae información de llamadas de seguimiento entre un entrenador personal (Miguel) y su cliente.
Reglas estrictas:
- Extrae SOLO lo que se dice en la transcripción. No inventes ni completes.
- Cada elemento debe llevar una cita literal breve ("quote", copiada exactamente de la transcripción, máx. 200 caracteres) y su segundo aproximado.
- "speaker": "client" si lo dice el cliente, "coach" si lo dice Miguel.
- Una posibilidad o suposición NO es un hecho: si no está afirmado, no lo incluyas.
- No hagas diagnósticos. Información médica → kind "health", sensitive=true.
- "issue_category" solo si encaja claramente; "polarity": problem (dificultad) / improvement (mejora o solución confirmada) / neutral.
- Compromisos: "client_commitment" (lo que hará el cliente) y "coach_commitment" (lo que hará Miguel).`;

export const EXTRACTION_TOOL = {
  name: 'guardar_informacion_llamada',
  description: 'Guarda la información extraída de la llamada',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: INSIGHT_KINDS },
            speaker: { type: 'string', enum: ['client', 'coach', 'unknown'] },
            text: { type: 'string', description: 'Resumen en una frase, en español' },
            quote: { type: 'string' },
            timestamp_sec: { type: 'integer' },
            issue_category: { type: ['string', 'null'], enum: [...ISSUE_CATEGORIES, null] },
            polarity: { type: 'string', enum: ['problem', 'improvement', 'neutral'] },
            sensitive: { type: 'boolean' },
          },
          required: ['kind', 'speaker', 'text', 'quote', 'polarity'],
        },
      },
    },
    required: ['items'],
  },
} as const;
