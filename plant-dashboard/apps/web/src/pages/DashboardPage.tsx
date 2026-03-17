import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Leaf,
  Droplets,
  AlertTriangle,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { usePlants } from '@core/hooks/usePlants';
import { useWatering } from '@core/hooks/useWatering';
import { useNotificationsStore } from '@core/stores/useNotificationsStore';
import { useCountUp } from '@ui/hooks/useCountUp';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Animated } from '../components/Animated';
import { LineChart } from '../components/charts/LineChart';
import { DonutChart } from '../components/charts/DonutChart';
import { BarChart } from '../components/charts/BarChart';

interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  delay?: number;
}

function KpiCard({
  title,
  value,
  icon,
  color,
  glowColor,
  trend,
  trendValue,
  delay = 0,
}: KpiCardProps) {
  const displayValue = useCountUp(value, 1500);
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-neon-green'
      : trend === 'down'
        ? 'text-red-400'
        : 'text-white/40';

  return (
    <Animated preset="slideUp" delay={delay}>
      <Card
        className="p-5 flex flex-col gap-4 hover:border-white/15 cursor-default"
        glassmorphism
        glow={false}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider">
            {title}
          </p>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: `${glowColor}20`,
              border: `1px solid ${glowColor}40`,
            }}
          >
            <div style={{ color }}>{icon}</div>
          </div>
        </div>
        <div>
          <motion.p
            className="text-3xl font-bold"
            style={{ color }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay / 1000 + 0.2, duration: 0.4 }}
          >
            {displayValue}
          </motion.p>
          {trend && trendValue && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${trendColor}`}>
              <TrendIcon size={12} />
              <span>{trendValue}</span>
            </div>
          )}
        </div>
      </Card>
    </Animated>
  );
}

const healthData = [
  { date: 'Mon', score: 72 },
  { date: 'Tue', score: 76 },
  { date: 'Wed', score: 74 },
  { date: 'Thu', score: 80 },
  { date: 'Fri', score: 83 },
  { date: 'Sat', score: 85 },
  { date: 'Sun', score: 82 },
];

const roomDistribution = [
  { name: 'Living Room', value: 8, color: '#00F0FF' },
  { name: 'Bedroom', value: 5, color: '#FF2E97' },
  { name: 'Kitchen', value: 3, color: '#39FF14' },
  { name: 'Office', value: 4, color: '#7B2FBE' },
];

const wateringHistory = [
  { day: 'Mon', count: 3 },
  { day: 'Tue', count: 5 },
  { day: 'Wed', count: 2 },
  { day: 'Thu', count: 4 },
  { day: 'Fri', count: 6 },
  { day: 'Sat', count: 3 },
  { day: 'Sun', count: 1 },
];

export function DashboardPage() {
  const { plants, fetchPlants } = usePlants();
  const { schedule, fetchSchedule } = useWatering();
  const notifications = useNotificationsStore((s) => s.notifications);

  useEffect(() => {
    fetchPlants();
    fetchSchedule();
  }, [fetchPlants, fetchSchedule]);

  const totalPlants = plants.length || 20;
  const healthScore =
    Math.round(
      plants.reduce((sum, p) => sum + p.healthScore, 0) / (plants.length || 1),
    ) || 83;
  const todayWatering =
    schedule.filter(
      (s) =>
        !s.isDone &&
        new Date(s.scheduledAt).toDateString() === new Date().toDateString(),
    ).length || 4;
  const activeAlerts = notifications.filter((n) => !n.isRead).length || 2;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Animated preset="slideDown">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
            <p className="text-sm text-white/50 mt-1">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
        </div>
      </Animated>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Plants"
          value={totalPlants}
          icon={<Leaf size={18} />}
          color="#39FF14"
          glowColor="#39FF14"
          trend="up"
          trendValue="+2 this month"
          delay={0}
        />
        <KpiCard
          title="Health Score"
          value={healthScore}
          icon={<Activity size={18} />}
          color="#00F0FF"
          glowColor="#00F0FF"
          trend="up"
          trendValue="+3% this week"
          delay={80}
        />
        <KpiCard
          title="Watering Today"
          value={todayWatering}
          icon={<Droplets size={18} />}
          color="#7B2FBE"
          glowColor="#7B2FBE"
          trend="stable"
          trendValue="On schedule"
          delay={160}
        />
        <KpiCard
          title="Active Alerts"
          value={activeAlerts}
          icon={<AlertTriangle size={18} />}
          color={activeAlerts > 0 ? '#FF4757' : '#39FF14'}
          glowColor={activeAlerts > 0 ? '#FF4757' : '#39FF14'}
          trend={activeAlerts > 0 ? 'down' : 'stable'}
          trendValue={activeAlerts > 0 ? 'Needs attention' : 'All good'}
          delay={240}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health trend */}
        <Animated preset="slideUp" delay={200}>
          <Card className="p-5 lg:col-span-2" glassmorphism>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">
                Health Score — Last 7 days
              </h3>
              <Badge variant="success" size="xs" dot>
                Live
              </Badge>
            </div>
            <LineChart
              data={healthData}
              lines={[{ key: 'score', label: 'Health %', color: '#00F0FF' }]}
              xKey="date"
              height={200}
              showLegend={false}
            />
          </Card>
        </Animated>

        {/* Room distribution */}
        <Animated preset="slideUp" delay={300}>
          <Card className="p-5" glassmorphism>
            <h3 className="text-sm font-semibold text-white mb-4">
              Plants by Room
            </h3>
            <DonutChart
              data={roomDistribution}
              height={200}
              innerRadius={50}
            />
          </Card>
        </Animated>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Watering history */}
        <Animated preset="slideUp" delay={350}>
          <Card className="p-5" glassmorphism>
            <h3 className="text-sm font-semibold text-white mb-4">
              Watering This Week
            </h3>
            <BarChart
              data={wateringHistory}
              barKey="count"
              xKey="day"
              color="#7B2FBE"
              height={180}
            />
          </Card>
        </Animated>

        {/* Upcoming watering */}
        <Animated preset="slideUp" delay={400}>
          <Card className="p-5" glassmorphism>
            <h3 className="text-sm font-semibold text-white mb-4">
              Upcoming Watering
            </h3>
            <div className="flex flex-col gap-3">
              {schedule.length === 0 ? (
                <div className="py-8 text-center text-white/30 text-sm">
                  No upcoming waterings
                </div>
              ) : (
                schedule.slice(0, 4).map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.06 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                      <Droplets size={14} className="text-neon-cyan" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {s.plant?.name ?? `Plant ${i + 1}`}
                      </p>
                      <p className="text-xs text-white/40">
                        {new Date(s.scheduledAt).toLocaleDateString()}
                      </p>
                    </div>
                    {s.isDone && (
                      <Badge variant="success" size="xs">
                        Done
                      </Badge>
                    )}
                    {!s.isDone && (
                      <Badge variant="warning" size="xs">
                        Pending
                      </Badge>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </Card>
        </Animated>
      </div>
    </div>
  );
}
