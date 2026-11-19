'use client';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';

const COLORS = ['#c6f432', '#7cc7ff', '#ff9f6b', '#c79bff', '#5ee0b5'];

export function MetricChart({ data, series, domain, height = 220, unit }: {
  data: Record<string, any>[]; series: { key: string; label: string }[]; domain?: [number | 'auto', number | 'auto']; height?: number; unit?: string;
}) {
  if (!data.length) return <div className="grid h-[180px] place-items-center text-sm text-ink-500">Sin datos todavía</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#262b27" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" stroke="#5b645d" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis stroke="#5b645d" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={domain ?? ['auto', 'auto']} unit={unit} />
          <Tooltip contentStyle={{ background: '#151816', border: '1px solid #363d38', borderRadius: 12, fontSize: 12 }} labelStyle={{ color: '#8a938c' }} />
          {domain && typeof domain[1] === 'number' && domain[1] === 10 && <ReferenceLine y={5} stroke="#363d38" />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


/** Barras de calorías por día; los días sin registro quedan vacíos (no 0). */
export function CalorieBars({ data, target, height = 240 }: { data: { label: string; kcal: number | null; avg?: boolean }[]; target?: number | null; height?: number }) {
  if (!data.some((d) => d.kcal != null)) return <div className="grid h-[180px] place-items-center text-sm text-ink-500">Sin comidas registradas en este periodo</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#262b27" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" stroke="#5b645d" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
          <YAxis stroke="#5b645d" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#1d211e' }} contentStyle={{ background: '#151816', border: '1px solid #363d38', borderRadius: 12, fontSize: 12 }} labelStyle={{ color: '#8a938c' }} formatter={(v: any) => [`${v} kcal`, 'Calorías']} />
          {target ? <ReferenceLine y={target} stroke="#ff9f6b" strokeDasharray="4 4" label={{ value: `Objetivo ${target}`, fill: '#ff9f6b', fontSize: 11, position: 'insideTopRight' }} /> : null}
          <Bar dataKey="kcal" radius={[6, 6, 0, 0]} maxBarSize={38}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.avg ? '#7cc7ff' : target && d.kcal != null && d.kcal > target * 1.1 ? '#ff9f6b' : '#c6f432'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const MACRO_COLORS = { Proteína: '#c6f432', Carbohidratos: '#7cc7ff', Grasa: '#ff9f6b' } as Record<string, string>;
/** Donut del reparto de macros (en % de calorías). */
export function MacroDonut({ protein, carbs, fat, height = 220 }: { protein: number | null; carbs: number | null; fat: number | null; height?: number }) {
  const rows = [
    { name: 'Proteína', g: protein ?? 0, kcal: (protein ?? 0) * 4 },
    { name: 'Carbohidratos', g: carbs ?? 0, kcal: (carbs ?? 0) * 4 },
    { name: 'Grasa', g: fat ?? 0, kcal: (fat ?? 0) * 9 },
  ];
  const total = rows.reduce((s, r) => s + r.kcal, 0);
  if (!total) return <div className="grid h-[180px] place-items-center text-sm text-ink-500">Sin macros registrados</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="kcal" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={3} stroke="none">
            {rows.map((r) => <Cell key={r.name} fill={MACRO_COLORS[r.name]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#151816', border: '1px solid #363d38', borderRadius: 12, fontSize: 12 }}
            formatter={(v: any, name: any, item: any) => [`${item.payload.g} g · ${Math.round((Number(v) / total) * 100)} %`, name]} />
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, color: '#8a938c' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
