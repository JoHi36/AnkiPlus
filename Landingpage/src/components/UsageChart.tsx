import { motion } from 'framer-motion';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  flash: number;
  deep: number;
}

interface UsageChartProps {
  dailyUsage?: DailyUsage[];
  deepLimit?: number; // -1 for unlimited
  flashLimit?: number; // -1 for unlimited
}

// Mock data for fallback
const mockData: DailyUsage[] = [
  { date: '2024-01-01', flash: 12, deep: 2 },
  { date: '2024-01-02', flash: 15, deep: 3 },
  { date: '2024-01-03', flash: 8, deep: 1 },
  { date: '2024-01-04', flash: 20, deep: 3 },
  { date: '2024-01-05', flash: 18, deep: 2 },
  { date: '2024-01-06', flash: 14, deep: 3 },
  { date: '2024-01-07', flash: 16, deep: 2 },
];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function calculateTrend(data: DailyUsage[]): 'up' | 'down' | 'stable' {
  if (data.length < 2) return 'stable';
  const recent = data.slice(-3).reduce((sum, d) => sum + d.deep, 0) / 3;
  const older = data.slice(0, 3).reduce((sum, d) => sum + d.deep, 0) / 3;
  if (recent > older * 1.1) return 'up';
  if (recent < older * 0.9) return 'down';
  return 'stable';
}

export function UsageChart({ dailyUsage = mockData, deepLimit, flashLimit }: UsageChartProps) {
  const data = dailyUsage.map(d => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  const trend = calculateTrend(dailyUsage);
  const totalDeep = dailyUsage.reduce((sum, d) => sum + d.deep, 0);
  const totalFlash = dailyUsage.reduce((sum, d) => sum + d.flash, 0);
  const avgDeep = totalDeep / dailyUsage.length;
  const avgFlash = totalFlash / dailyUsage.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Nutzungsstatistiken</h3>
        <div className="flex items-center gap-2">
          {trend === 'up' && (
            <div className="flex items-center gap-1 text-green-400 text-sm">
              <TrendingUp className="w-4 h-4" />
              <span>Aufwärtstrend</span>
            </div>
          )}
          {trend === 'down' && (
            <div className="flex items-center gap-1 text-red-400 text-sm">
              <TrendingDown className="w-4 h-4" />
              <span>Abwärtstrend</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-1">Total Deep Mode</div>
          <div className="text-lg font-bold text-white">{totalDeep}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-1">Ø Deep Mode/Tag</div>
          <div className="text-lg font-bold text-white">{avgDeep.toFixed(1)}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-1">Total Flash Mode</div>
          <div className="text-lg font-bold text-white">{totalFlash}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-1">Ø Flash Mode/Tag</div>
          <div className="text-lg font-bold text-white">{avgFlash.toFixed(1)}</div>
        </div>
      </div>

      {/* Line Chart - Deep Mode Usage */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-neutral-400 mb-4">Deep Mode (letzte 7 Tage)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis 
              dataKey="dateFormatted" 
              stroke="#666"
              tick={{ fill: '#999', fontSize: 12 }}
            />
            <YAxis 
              stroke="#666"
              tick={{ fill: '#999', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0A0A0A',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            {deepLimit && deepLimit !== -1 && (
              <ReferenceLine 
                y={deepLimit} 
                stroke="#ef4444" 
                strokeDasharray="5 5"
                label={{ value: 'Limit', position: 'right', fill: '#ef4444' }}
              />
            )}
            <Line 
              type="monotone" 
              dataKey="deep" 
              stroke="#a855f7" 
              strokeWidth={2}
              dot={{ fill: '#a855f7', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar Chart - Daily Usage (Flash + Deep) */}
      <div>
        <h4 className="text-sm font-medium text-neutral-400 mb-4">Tägliche Nutzung (Flash + Deep)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis 
              dataKey="dateFormatted" 
              stroke="#666"
              tick={{ fill: '#999', fontSize: 12 }}
            />
            <YAxis 
              stroke="#666"
              tick={{ fill: '#999', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0A0A0A',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Bar dataKey="flash" stackId="a" fill="#14b8a6" />
            <Bar dataKey="deep" stackId="a" fill="#a855f7" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}


