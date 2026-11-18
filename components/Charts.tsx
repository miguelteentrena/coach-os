'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';

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
