import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, List, Plus, Leaf } from 'lucide-react';
import { usePlants } from '@core/hooks/usePlants';
import type { Plant, PlantHealthStatus } from '@core/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { SearchBar } from '../components/ui/SearchBar';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/EmptyState';
import { PlantCardSkeleton } from '../components/ui/SkeletonLoader';
import { Animated } from '../components/Animated';

const healthBadgeVariant: Record<
  PlantHealthStatus,
  'success' | 'primary' | 'warning' | 'danger' | 'ghost'
> = {
  excellent: 'success',
  good: 'success',
  fair: 'primary',
  poor: 'warning',
  critical: 'danger',
};

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? '#39FF14'
      : score >= 60
        ? '#00F0FF'
        : score >= 40
          ? '#FFD600'
          : '#FF4757';
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

function PlantCard({
  plant,
  onClick,
}: {
  plant: Plant;
  onClick: () => void;
}) {
  return (
    <Card hoverable onClick={onClick} className="overflow-hidden group">
      <div className="h-44 bg-gradient-to-br from-neon-green/5 to-neon-cyan/5 flex items-center justify-center overflow-hidden">
        {plant.imageUrl ? (
          <img
            src={plant.imageUrl}
            alt={plant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <Leaf className="w-12 h-12 text-white/15" />
        )}
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white truncate">
              {plant.name}
            </h3>
            {plant.species && (
              <p className="text-xs text-white/40 italic">
                {plant.species.commonName}
              </p>
            )}
          </div>
          <Badge variant={healthBadgeVariant[plant.healthStatus]} size="xs">
            {plant.healthStatus}
          </Badge>
        </div>
        <HealthBar score={plant.healthScore} />
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{plant.room?.name ?? 'No room'}</span>
          {plant.nextWateringAt && (
            <span className="flex items-center gap-1">
              💧 {new Date(plant.nextWateringAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function PlantRow({
  plant,
  onClick,
}: {
  plant: Plant;
  onClick: () => void;
}) {
  return (
    <motion.div
      layout
      onClick={onClick}
      className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/15 cursor-pointer transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-neon-green/10 border border-neon-green/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {plant.imageUrl ? (
          <img
            src={plant.imageUrl}
            alt={plant.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Leaf size={18} className="text-neon-green/60" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{plant.name}</p>
        <p className="text-xs text-white/40">
          {plant.species?.commonName ?? 'Unknown species'}
        </p>
      </div>
      <div className="w-20 hidden sm:block">
        <HealthBar score={plant.healthScore} />
        <p className="text-xs text-white/40 mt-1 text-center">
          {plant.healthScore}%
        </p>
      </div>
      <Badge
        variant={healthBadgeVariant[plant.healthStatus]}
        size="xs"
        className="hidden sm:flex"
      >
        {plant.healthStatus}
      </Badge>
      <p className="text-xs text-white/40 hidden md:block">
        {plant.room?.name ?? '—'}
      </p>
    </motion.div>
  );
}

export function PlantsPage() {
  const navigate = useNavigate();
  const {
    plants,
    isLoading,
    fetchPlants,
    applyFilter: filterPlants,
    sort,
  } = usePlants();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [healthFilter, setHealthFilter] = useState('');
  const [sortBy, setSortBy] = useState('');

  useEffect(() => {
    fetchPlants();
  }, [fetchPlants]);

  const handleSearch = (q: string) => filterPlants({ search: q });
  const handleHealthFilter = (val: string) => {
    setHealthFilter(val);
    filterPlants({ healthStatus: (val as PlantHealthStatus) || undefined });
  };
  const handleSort = (val: string) => {
    setSortBy(val);
    sort(
      val as 'name' | 'health' | 'createdAt' | 'nextWatering' | undefined,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Animated preset="slideDown">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">My Plants</h1>
            <p className="text-sm text-white/50 mt-1">
              {plants.length} plant{plants.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onAction={() => navigate('/plants/new')}
          >
            Add Plant
          </Button>
        </div>
      </Animated>

      {/* Filters */}
      <Animated preset="fadeIn" delay={100}>
        <div className="flex flex-wrap gap-3 items-center">
          <SearchBar
            placeholder="Search plants..."
            onSearch={handleSearch}
            className="flex-1 min-w-48 max-w-xs"
          />
          <Select
            options={[
              { value: '', label: 'All health' },
              { value: 'excellent', label: 'Excellent' },
              { value: 'good', label: 'Good' },
              { value: 'fair', label: 'Fair' },
              { value: 'poor', label: 'Poor' },
              { value: 'critical', label: 'Critical' },
            ]}
            value={healthFilter}
            onChange={handleHealthFilter}
            placeholder="Health status"
            className="w-40 relative"
          />
          <Select
            options={[
              { value: '', label: 'Default sort' },
              { value: 'name', label: 'Name' },
              { value: 'health', label: 'Health score' },
              { value: 'nextWatering', label: 'Next watering' },
              { value: 'createdAt', label: 'Date added' },
            ]}
            value={sortBy}
            onChange={handleSort}
            placeholder="Sort by"
            className="w-40 relative"
          />
          <div className="flex items-center gap-1 ml-auto bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </Animated>

      {/* Content */}
      {isLoading ? (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'flex flex-col gap-3'
          }
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <PlantCardSkeleton key={i} />
          ))}
        </div>
      ) : plants.length === 0 ? (
        <EmptyState
          icon={Leaf}
          title="No plants yet"
          description="Add your first plant to start tracking its health and care schedule."
          action={{
            label: 'Add your first plant',
            onAction: () => navigate('/plants/new'),
          }}
        />
      ) : (
        <AnimatePresence mode="popLayout">
          {viewMode === 'grid' ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {plants.map((plant, i) => (
                <motion.div
                  key={plant.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    delay: i * 0.04,
                    duration: 0.4,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                >
                  <PlantCard
                    plant={plant}
                    onClick={() => navigate(`/plants/${plant.id}`)}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              {plants.map((plant, i) => (
                <motion.div
                  key={plant.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <PlantRow
                    plant={plant}
                    onClick={() => navigate(`/plants/${plant.id}`)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
