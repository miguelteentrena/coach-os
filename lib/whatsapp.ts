import type { Analysis } from './analysis';

/** Borrador local basado en reglas (sin enviar datos de salud a terceros).
 *  Nunca se envía: el coach lo edita, lo copia y lo marca como enviado. */

export interface DraftContext {
  daysRemaining?: number | null;
  recentAchievements?: { title: string; on: string }[];       // últimos 14 días
  lifeContext?: { text: string; on: string }[];               // llamadas recientes: situación personal, agenda, viajes (nunca salud)
  resolvedCategories?: string[];                              // advertencias ya resueltas → no insistir
  recentTopics?: string[];                                    // temas de mensajes enviados en los últimos 21 días → no repetir
  openCoachCommitments?: string[];                            // se muestran al coach, no se prometen en el mensaje
}
export interface Draft { text: string; topics: string[]; notes: string[] }

const TOPIC_OF: [RegExp, string][] = [
  [/seguimiento/i, 'nutrition_adherence'], [/cansancio|recuperaci/i, 'fatigue_recovery'], [/sesiones/i, 'training_adherence'],
  [/estr[eé]s/i, 'stress'], [/motivaci/i, 'motivation'], [/sue[ñn]o/i, 'sleep'], [/hambre|saciedad/i, 'hunger'],
  [/hidrataci/i, 'hydration'], [/peso/i, 'weight_change'],
];
const topicOf = (metric: string) => TOPIC_OF.find(([re]) => re.test(metric))?.[1] ?? 'other';

const LINES: Record<string, [string, string]> = {
  nutrition_adherence: ['He visto que esta semana ha costado más seguir el plan. ¿Qué es lo que más te ha dificultado? Lo ajustamos para que te sea más fácil.',
    'Sobre la alimentación que ya comentamos, ¿cómo lo vas notando estos días? Si algo no encaja, lo adaptamos.'],
  fatigue_recovery: ['Veo que llegas bastante cansado/a y recuperando peor. ¿Cómo has dormido y cómo has sentido los entrenos? Si hace falta ajustamos la carga.',
    '¿Cómo va la energía después del ajuste de carga? Cuéntame qué tal responden las piernas y el cuerpo.'],
  training_adherence: ['Esta semana han salido menos sesiones de lo previsto. ¿Ha sido por tiempo o por otra cosa? Buscamos la forma de encajarlas.',
    '¿Cómo vas encajando las sesiones esta semana? Si la agenda aprieta, lo reorganizamos.'],
  stress: ['Noto que ha sido una semana con bastante estrés. ¿Quieres que adaptemos algo del plan para que sea más llevadero?',
    'Sé que el estrés viene de lejos. Esta semana prioriza lo básico y lo demás lo adaptamos sin problema.'],
  motivation: ['Te noto con menos energía de cara a la próxima semana. ¿Qué te ayudaría a arrancarla con más ganas?',
    '¿Cómo te sientes de ánimo con el proceso? Si quieres, buscamos un objetivo pequeño para esta semana.'],
  sleep: ['He visto que el descanso no ha ido del todo bien. ¿Qué ha pasado estos días con el sueño?',
    '¿Cómo va el descanso? Es de lo que más influye en todo lo demás.'],
  hunger: ['Veo que has tenido bastante hambre esta semana. Revisamos el reparto de comidas para que te sacie más.',
    '¿Sigues notando hambre entre comidas? Si es así, movemos cantidades.'],
  hydration: ['Ojo con la hidratación esta semana, ha bajado. ¿Te pongo algún recordatorio sencillo?', '¿Cómo vas con el agua estos días?'],
  weight_change: ['He visto el cambio en el peso de esta semana; tranquilo/a, lo miramos junto con el resto de datos.', 'El peso fluctúa; lo importante es la tendencia. Lo seguimos mirando juntos.'],
  other: ['Hay un par de cosas de tu check-in que me gustaría comentar contigo.', 'Hay algún detalle del check-in que quiero comentarte.'],
};

export function draftWhatsApp(firstName: string, a: Analysis, ctx: DraftContext = {}): Draft | null {
  if (!a.needsAction) return null;
  const notes: string[] = [];
  const topics: string[] = [];
  const lines: string[] = [`¡Hola ${firstName}! Ya he revisado tu check-in de esta semana.`];

  // Contexto personal de llamadas recientes: tono más suave, sin detalles sensibles
  if (ctx.lifeContext?.length) {
    lines.push('Sé que estos días tienes bastante encima, así que vamos paso a paso y sin presión.');
    notes.push(`Contexto de llamadas: ${ctx.lifeContext.map((l) => `${l.text} (${l.on})`).join(' · ')}`);
  }
  // Logro reciente (de llamada o formulario) antes que el positivo genérico
  const ach = ctx.recentAchievements?.[0];
  const pos = a.positives.find((p) => p.metric !== 'Orgullo') ?? a.positives[0];
  if (ach) lines.push(`Por cierto, enhorabuena por lo de «${ach.title.length > 80 ? ach.title.slice(0, 77) + '…' : ach.title}» 💪`);
  else if (pos) lines.push(pos.metric === 'Orgullo' ? 'Me alegra mucho leer lo que comentas de esta semana 💪' : `Muy buena señal: ${pos.text.charAt(0).toLowerCase() + pos.text.slice(1)}.`);

  const personal = a.textsToReview.find((t) => t.why.startsWith('Menciona'));
  const asked = a.textsToReview.find((t) => t.why.startsWith('Pregunta'));
  if (personal) lines.push('He leído lo que me comentas y me gustaría que lo habláramos con calma. ¿Cómo lo llevas hoy?');
  else {
    const candidates = [...a.signals.filter((s) => s.severity === 'red'), ...a.signals.filter((s) => s.severity === 'yellow')]
      .map((s) => topicOf(s.metric)).filter((t, i, arr) => arr.indexOf(t) === i);
    const main = candidates.find((t) => !ctx.resolvedCategories?.includes(t)) ?? null;
    if (candidates.length && !main) notes.push('Las señales de esta semana corresponden a temas ya resueltos: revisa si merece la pena mencionarlos.');
    if (main) {
      const repeated = ctx.recentTopics?.includes(main);
      lines.push(LINES[main][repeated ? 1 : 0]);
      topics.push(main);
      if (repeated) notes.push('Este tema ya se trató en un mensaje de las últimas 3 semanas: se usa un enfoque distinto.');
    }
  }
  if (asked && !personal) lines.push('Sobre lo que me preguntas, te respondo en un rato con detalle 👌');
  if (ctx.daysRemaining != null && ctx.daysRemaining <= 15 && ctx.daysRemaining >= 0) {
    lines.push(`Además, te quedan ${ctx.daysRemaining} días de programa: me gustaría que hablásemos de cómo seguir.`);
    topics.push('renewal');
  }
  if (ctx.openCoachCommitments?.length) notes.push(`Tienes pendiente con este cliente: ${ctx.openCoachCommitments.join(' · ')}`);
  lines.push('Cualquier cosa, aquí estoy.');
  return { text: lines.join('\n\n'), topics, notes };
}
