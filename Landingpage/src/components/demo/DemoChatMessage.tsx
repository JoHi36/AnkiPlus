import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Bot, BookOpen, ExternalLink, Copy, ThumbsUp } from 'lucide-react';
import { motion } from 'framer-motion';

import 'katex/dist/katex.min.css';

interface DemoChatMessageProps {
  content: string;
  isStreaming: boolean;
  citations: string[];
}

export function DemoChatMessage({ content, isStreaming, citations }: DemoChatMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');

  // Streaming effect
  useEffect(() => {
    if (isStreaming) {
      let charIndex = 0;
      const intervalId = setInterval(() => {
        if (charIndex < content.length) {
          setDisplayedContent(prev => content.slice(0, charIndex + 3)); // 3 chars at a time for speed
          charIndex += 3;
        } else {
          clearInterval(intervalId);
          setDisplayedContent(content);
        }
      }, 10);
      return () => clearInterval(intervalId);
    } else {
      setDisplayedContent(content);
    }
  }, [content, isStreaming]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-4 w-full max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center border border-teal-500/20 mt-1">
        <Bot size={18} className="text-teal-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-4">
        {/* Name Header */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-teal-400">Anki+ AI</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20 font-mono">
            DEEP MODE
          </span>
        </div>

        {/* Markdown Content */}
        <div className="prose prose-invert prose-sm max-w-none 
          prose-p:text-neutral-300 prose-p:leading-relaxed 
          prose-headings:text-white prose-headings:font-semibold 
          prose-strong:text-teal-200 prose-strong:font-bold
          prose-ul:my-2 prose-li:my-0.5
          prose-code:text-teal-300 prose-code:bg-teal-950/30 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
          prose-blockquote:border-l-teal-500 prose-blockquote:bg-teal-500/5 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r
          [&>*:first-child]:mt-0
        ">
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {displayedContent}
          </ReactMarkdown>
        </div>

        {/* Citations Carousel */}
        {displayedContent.length > 50 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex gap-2 overflow-x-auto pb-2 pt-2 scrollbar-hide"
          >
            {citations.map((cite, i) => (
              <div key={i} className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#1A1A1A] border border-white/5 hover:border-teal-500/30 transition-colors cursor-default group">
                <BookOpen size={12} className="text-neutral-500 group-hover:text-teal-400" />
                <span className="text-[10px] text-neutral-400 group-hover:text-neutral-200 whitespace-nowrap">
                  {cite}
                </span>
                <ExternalLink size={10} className="text-neutral-600 group-hover:text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </motion.div>
        )}

        {/* Action Bar */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <button className="p-1.5 rounded hover:bg-white/5 text-neutral-500 hover:text-white transition-colors">
            <Copy size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-white/5 text-neutral-500 hover:text-white transition-colors">
            <ThumbsUp size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
