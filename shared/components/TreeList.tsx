import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

/**
 * TreeList — Generic expandable tree list.
 * Extracted from DeckBrowser's DeckRow pattern.
 * Uses design system tokens exclusively.
 *
 * @example
 * <TreeList
 *   items={[{ id: '1', label: 'Foundations', children: [{ id: '1a', label: 'Materials' }] }]}
 *   onItemClick={(item) => scrollTo(item.id)}
 *   renderRight={(item) => <span>{item.children?.length}</span>}
 * />
 */

export interface TreeItem {
  id: string;
  label: string;
  children?: TreeItem[];
}

interface TreeListProps {
  /** Flat or nested items to render */
  items: TreeItem[];
  /** Called when a leaf item (no children) is clicked */
  onItemClick?: (item: TreeItem) => void;
  /** Optional: render custom content on the right side of each row */
  renderRight?: (item: TreeItem, depth: number) => React.ReactNode;
  /** Optional: header label above the list */
  header?: string;
  /** Optional: start root items expanded (default false) */
  defaultExpanded?: boolean;
}

/* ── Row (recursive) ── */
function TreeRow({
  item,
  onItemClick,
  renderRight,
  depth = 0,
  index = 0,
  defaultExpanded = false,
}: {
  item: TreeItem;
  onItemClick?: (item: TreeItem) => void;
  renderRight?: (item: TreeItem, depth: number) => React.ReactNode;
  depth?: number;
  index?: number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = useCallback(() => {
    if (hasChildren) {
      setExpanded(v => !v);
    } else {
      onItemClick?.(item);
    }
  }, [hasChildren, onItemClick, item]);

  return (
    <div>
      <motion.button
        onClick={handleClick}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: `6px 16px 6px ${16 + depth * 16}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 0,
        }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.035, type: 'spring', stiffness: 360, damping: 32 }}
        whileHover={{ backgroundColor: 'var(--ds-hover-tint)' }}
        whileTap={{ scale: 0.99 }}
      >
        {/* Chevron / dot */}
        <div style={{
          width: 14, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, paddingTop: 1,
        }}>
          {hasChildren ? (
            <motion.div
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{ display: 'flex' }}
            >
              <ChevronRight size={12} style={{ color: 'var(--ds-text-tertiary)' }} />
            </motion.div>
          ) : (
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: 'var(--ds-text-muted)',
              flexShrink: 0,
            }} />
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: depth === 0 ? 13 : 12,
              fontWeight: depth === 0 ? 600 : 400,
              color: depth === 0 ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {item.label}
            </span>

            {/* Custom right content */}
            {renderRight && renderRight(item, depth)}
          </div>
        </div>
      </motion.button>

      {/* Children */}
      <AnimatePresence initial={false}>
        {expanded && hasChildren && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 370, damping: 34 }}
            style={{ overflow: 'hidden' }}
          >
            {item.children!.map((child, ci) => (
              <TreeRow
                key={child.id}
                item={child}
                onItemClick={onItemClick}
                renderRight={renderRight}
                depth={depth + 1}
                index={ci}
                defaultExpanded={false}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main export ── */
export default function TreeList({
  items,
  onItemClick,
  renderRight,
  header,
  defaultExpanded = false,
}: TreeListProps) {
  return (
    <div className="ds-borderless" style={{ overflow: 'hidden' }}>
      {header && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 16px 8px',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'var(--ds-text-tertiary)',
          }}>
            {header}
          </span>
          <span style={{
            fontSize: 9, color: 'var(--ds-text-muted)',
            background: 'var(--ds-hover-tint)',
            borderRadius: 4, padding: '0 4px',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {items.length}
          </span>
        </div>
      )}

      {items.map((item, i) => (
        <TreeRow
          key={item.id}
          item={item}
          onItemClick={onItemClick}
          renderRight={renderRight}
          depth={0}
          index={i}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  );
}
