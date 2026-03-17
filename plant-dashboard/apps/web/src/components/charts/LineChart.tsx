import {
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  [key: string]: string | number;
}

interface LineConfig {
  key: string;
  label: string;
  color: string;
}

interface LineChartProps {
  data: DataPoint[];
  lines: LineConfig[];
  xKey: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
}

export function LineChart({
  data,
  lines,
  xKey,
  height = 300,
  showGrid = true,
  showLegend = true,
}: LineChartProps) {
  return (
    <div aria-label="Line chart" role="img">
      <ResponsiveContainer width="100%" height={height}>
        <ReLineChart
          data={data}
          margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
          )}
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(22,33,62,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '13px',
            }}
            cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: '12px',
              }}
            />
          )}
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: line.color }}
            />
          ))}
        </ReLineChart>
      </ResponsiveContainer>
    </div>
  );
}
