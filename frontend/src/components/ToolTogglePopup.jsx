import React, { useState, useEffect, useRef } from 'react';
import { Image, Workflow, Atom, X } from 'lucide-react';

/**
 * ToolTogglePopup Komponente
 * Modernes, cleanes Popup-Menü für die Steuerung von AI-Tools
 * Minimalistisch, professionell, ohne Backdrop-Blur
 */
export default function ToolTogglePopup({ 
  isOpen, 
  onClose, 
  tools, 
  onToolsChange,
  bridge
}) {
  const popupRef = useRef(null);
  const [localTools, setLocalTools] = useState(tools || {
    images: true,
    diagrams: true,
    molecules: false
  });

  // Update local state when tools prop changes
  useEffect(() => {
    if (tools) {
      setLocalTools(tools);
    }
  }, [tools]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        // Check if click is not on the button that opened this popup
        const button = event.target.closest('button[title="Agent Tools"]');
        if (!button) {
          onClose();
        }
      }
    };

    // Small delay to prevent immediate close on open
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleToggle = (toolKey) => {
    const newTools = {
      ...localTools,
      [toolKey]: !localTools[toolKey]
    };
    setLocalTools(newTools);
    onToolsChange(newTools);
  };

  if (!isOpen) return null;

  const toolConfigs = [
    {
      key: 'images',
      label: 'Bilder',
      icon: Image,
      description: 'Bilder suchen und einbinden'
    },
    {
      key: 'diagrams',
      label: 'Diagramme',
      icon: Workflow,
      description: 'Mermaid-Diagramme erstellen'
    },
    {
      key: 'molecules',
      label: 'Moleküle',
      icon: Atom,
      description: 'Chemische Strukturen über SMILES',
      isBeta: true
    }
  ];

  return (
    <div
      ref={popupRef}
      className="bg-base-100 border border-base-300 rounded-xl shadow-xl min-w-[240px] animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ 
        boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)'
      }}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300/50">
          <h3 className="text-sm font-semibold text-base-content">Agent Tools</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
            title="Schließen"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Tool List */}
        <div className="p-2">
          {toolConfigs.map((tool, index) => {
            const Icon = tool.icon;
            const isActive = localTools[tool.key];
            
            return (
              <button
                key={tool.key}
                onClick={() => handleToggle(tool.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-150 ${
                  index < toolConfigs.length - 1 ? 'mb-1' : ''
                } ${
                  isActive
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : 'bg-transparent border border-transparent hover:bg-base-200/50'
                }`}
              >
                {/* Left: Icon + Label */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-blue-500/10 text-blue-500'
                      : 'bg-base-200 text-base-content/50'
                  }`}>
                    <Icon size={16} strokeWidth={2} />
                  </div>
                  
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium transition-colors ${
                        isActive ? 'text-blue-500' : 'text-base-content/70'
                      }`}>
                        {tool.label}
                      </span>
                      {tool.isBeta && (
                        <span className="text-[10px] font-medium text-base-content/40 bg-base-200 px-1.5 py-0.5 rounded">
                          Beta
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-base-content/50 mt-0.5">
                      {tool.description}
                    </p>
                  </div>
                </div>

                {/* Right: Toggle Switch */}
                <div className={`flex-shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-3 ${
                  isActive
                    ? 'bg-blue-500'
                    : 'bg-base-300'
                }`}>
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isActive ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
    </div>
  );
}
