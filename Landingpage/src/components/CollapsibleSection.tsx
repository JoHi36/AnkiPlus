import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (!contentRef.current) return;
    setHeight(open ? contentRef.current.scrollHeight : 0);
  }, [open]);

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center py-[18px] cursor-pointer"
      >
        <span className="text-[14px] font-medium text-white/[0.7]">{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/[0.2] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        style={{ height, overflow: 'hidden', transition: 'height 200ms ease' }}
      >
        <div ref={contentRef} className="pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}
