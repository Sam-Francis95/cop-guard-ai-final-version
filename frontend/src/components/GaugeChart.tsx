import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export default function GaugeChart({ score }: { score: number }) {
  const data = [
    { name: 'Score', value: score },
    { name: 'Remaining', value: 100 - score }
  ];

  const getColor = (s: number) => {
    if (s <= 30) return '#22c55e'; // Green
    if (s <= 70) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  };

  const COLORS = [getColor(score), '#111827']; 

  return (
    <div className="relative w-full h-48 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
            isAnimationActive={true}
            animationBegin={200}
            animationDuration={800}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute bottom-4 flex flex-col items-center">
        <span className="text-4xl font-bold font-mono text-white tracking-widest">{score}</span>
        <span className="text-xs text-gray-500 uppercase tracking-widest mt-1">Fraud Score</span>
      </div>
    </div>
  );
}
