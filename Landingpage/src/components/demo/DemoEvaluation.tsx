import { motion } from 'framer-motion';
import { Target, TrendingUp } from 'lucide-react';

interface DemoEvaluationProps {
  score: number;
  feedback: string;
}

export function DemoEvaluation({ score, feedback }: DemoEvaluationProps) {
  // Color logic based on score
  const getColor = (s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-teal-500';
    if (s >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  const colorClass = getColor(score);
  const strokeColor = score >= 90 ? '#22c55e' : score >= 70 ? '#14b8a6' : score >= 50 ? '#eab308' : '#ef4444';

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="bg-[#151515] border border-white/5 rounded-2xl p-5 flex gap-5 items-start relative overflow-hidden group"
    >
       {/* Background Glow */}
       <div className={`absolute top-0 right-0 w-32 h-32 bg-current opacity-[0.03] blur-2xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none ${colorClass}`} />

       {/* Score Ring */}
       <div className="relative flex-shrink-0 w-16 h-16 flex items-center justify-center">
         <svg className="w-full h-full -rotate-90">
           {/* Background Circle */}
           <circle
             cx="32"
             cy="32"
             r={radius}
             fill="transparent"
             stroke="currentColor"
             strokeWidth="4"
             className="text-white/5"
           />
           {/* Progress Circle */}
           <motion.circle
             initial={{ strokeDashoffset: circumference }}
             animate={{ strokeDashoffset }}
             transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
             cx="32"
             cy="32"
             r={radius}
             fill="transparent"
             stroke={strokeColor}
             strokeWidth="4"
             strokeLinecap="round"
             strokeDasharray={circumference}
           />
         </svg>
         <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-sm font-bold ${colorClass}`}>{score}%</span>
         </div>
       </div>

       {/* Content */}
       <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
             <Target size={14} className={colorClass} />
             <span className="text-xs font-bold text-white uppercase tracking-wider">Evaluation Result</span>
          </div>
          
          <p className="text-sm text-neutral-300 leading-relaxed mb-3">
            {feedback}
          </p>

          <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono">
             <TrendingUp size={12} />
             <span>AI CONFIDENCE: HIGH</span>
          </div>
       </div>
    </motion.div>
  );
}
