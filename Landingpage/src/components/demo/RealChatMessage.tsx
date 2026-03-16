import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Bot, CheckCircle, Lightbulb, List, Brain, Sparkles, MessageSquare } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { DemoMermaidDiagram } from './DemoMermaidDiagram';
import { DemoECGImage } from './DemoECGImage';

interface RealChatMessageProps {
  message: string;
  isStreaming: boolean;
  citations: string[];
}

export function RealChatMessage({ message, isStreaming, citations }: RealChatMessageProps) {
  
  // Custom Renderers to match app style exactly
  const components = {
    // Typography
    h1: ({node, children, ...props}: any) => <h1 className="text-xl font-bold mt-6 mb-3 text-white tracking-tight first:mt-0" {...props}>{children}</h1>,
    h2: ({node, children, ...props}: any) => <h2 className="text-lg font-bold mt-5 mb-3 text-white/95 first:mt-0" {...props}>{children}</h2>,
    h3: ({node, children, ...props}: any) => <h3 className="text-base font-semibold mt-4 mb-2 text-white/90" {...props}>{children}</h3>,
    p: ({node, children, ...props}: any) => <p className="mb-5 text-[15px] leading-[1.8] text-white/85" {...props}>{children}</p>,
    
    // Lists
    ul: ({node, ...props}: any) => <ul className="mb-6 ml-5 list-disc space-y-3 text-white/85 marker:text-teal-500/60" {...props} />,
    ol: ({node, ...props}: any) => <ol className="mb-6 ml-5 list-decimal space-y-3 text-white/85 marker:text-teal-500/80 marker:font-medium" {...props} />,
    li: ({node, children, ...props}: any) => <li className="pl-1" {...props}>{children}</li>,
    
    // Blockquote
    blockquote: ({node, children, ...props}: any) => (
      <blockquote className="border-l-4 border-teal-500/30 bg-teal-500/5 px-5 py-4 my-6 rounded-r-lg text-white/80 italic relative" {...props}>
        {children}
      </blockquote>
    ),
    
    // Code blocks & Inline Code
    code: ({node, inline, className, children, ...props}: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const content = String(children).replace(/\n$/, '');

        // Demo Custom Injectors
        if (content.includes('mermaiddiagram')) {
            return <DemoMermaidDiagram />;
        }
        if (content.includes('ecgimage')) {
            return <DemoECGImage />;
        }

        if (inline) {
            return (
                <code className="bg-white/10 text-teal-300 px-1.5 py-0.5 rounded text-[0.9em] font-mono border border-white/5" {...props}>
                    {children}
                </code>
            );
        }

        return (
            <div className="my-6 rounded-xl overflow-hidden border border-white/10 bg-[#1e1e1e] shadow-sm group">
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                    <span className="text-xs font-medium text-white/40 font-mono">
                        {match ? match[1] : 'text'}
                    </span>
                </div>
                <div className="p-4 overflow-x-auto">
                    <code className="text-sm font-mono text-white/80 leading-relaxed whitespace-pre" {...props}>
                        {children}
                    </code>
                </div>
            </div>
        );
    },

    // Links (Citations)
    a: ({node, href, children, ...props}: any) => {
        return (
            <a 
                href={href} 
                className="text-teal-400 hover:text-teal-300 underline underline-offset-4 decoration-teal-500/30 hover:decoration-teal-500/60 transition-all" 
                target="_blank" 
                rel="noopener noreferrer"
                {...props}
            >
                {children}
            </a>
        );
    },

    // Bold (Highlighter style)
    strong: ({node, children, ...props}: any) => (
        <strong className="font-bold text-white bg-teal-500/20 px-1 rounded-sm mx-0.5" {...props}>
            {children}
        </strong>
    ),

    // Table
    table: ({node, children, ...props}: any) => (
        <div className="my-6 overflow-hidden rounded-xl border border-white/10 shadow-sm">
            <table className="w-full text-sm text-left" {...props}>{children}</table>
        </div>
    ),
    thead: ({node, children, ...props}: any) => <thead className="bg-white/5 text-white/90 font-semibold" {...props}>{children}</thead>,
    tbody: ({node, children, ...props}: any) => <tbody className="divide-y divide-white/5 bg-transparent" {...props}>{children}</tbody>,
    tr: ({node, children, ...props}: any) => <tr className="transition-colors hover:bg-white/5" {...props}>{children}</tr>,
    th: ({node, children, ...props}: any) => <th className="px-4 py-3 font-semibold" {...props}>{children}</th>,
    td: ({node, children, ...props}: any) => <td className="px-4 py-3 text-white/70" {...props}>{children}</td>,
  };

  return (
    <div className="flex flex-col mb-10 animate-in slide-in-from-left-4 duration-500 w-full min-w-0">
        <div className="markdown-content w-full">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={components}
            >
                {message}
            </ReactMarkdown>
        </div>
    </div>
  );
}
