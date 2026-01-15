import { motion } from 'framer-motion';

interface DemoAnkiCardProps {
  content: string;
  tags: string[];
}

export function DemoAnkiCard({ content, tags }: DemoAnkiCardProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[#1A1A1A] text-center relative overflow-hidden group">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
            backgroundImage: `radial-gradient(#fff 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
        }}
      />
      
      {/* Tags */}
      <div className="flex flex-wrap gap-2 justify-center mb-8">
        {tags.map((tag, i) => (
          <span 
            key={i}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-neutral-500 border border-white/5 uppercase tracking-wider"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Content */}
      <h3 className="text-2xl sm:text-3xl font-medium text-white leading-relaxed max-w-2xl font-serif">
        {content}
      </h3>

      {/* Decorative Line */}
      <div className="w-16 h-1 bg-teal-500/20 rounded-full mt-8 group-hover:bg-teal-500/50 transition-colors duration-500" />
      
      <div className="absolute bottom-4 text-[10px] text-neutral-600 font-mono">
        DECK: DEFAULT
      </div>
    </div>
  );
}
