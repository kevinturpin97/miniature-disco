import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DonutData {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutData[];
  height?: number;
  innerRadius?: number;
  showLegend?: boolean;
}

export function DonutChart({
  data,
  height = 250,
  innerRadius = 60,
  showLegend = true,
}: DonutChartProps) {
  return (
    <div aria-label="Donut chart" role="img">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={innerRadius + 30}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'rgba(22,33,62,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '13px',
            }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: '12px',
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
