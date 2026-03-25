import React, { useState } from 'react';
import WorkflowCard from './WorkflowCard';

export default function WorkflowList({ agent, bridge }) {
  const [expandedWorkflow, setExpandedWorkflow] = useState(null);
  const workflows = agent?.workflows || [];

  const handleToggleWorkflow = (workflowName, newMode) => {
    bridge?.addMessage?.('saveWorkflowConfig', {
      agent: agent.name,
      workflow: workflowName,
      mode: newMode,
    });
  };

  const handleSlotToggle = (workflowName, slotRef, newMode) => {
    bridge?.addMessage?.('saveWorkflowConfig', {
      agent: agent.name,
      workflow: workflowName,
      slot: slotRef,
      mode: newMode,
    });
  };

  if (workflows.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--ds-text-muted)', fontSize: '13px' }}>
        Keine Workflows konfiguriert.
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--ds-text-muted)',
        marginBottom: '8px',
        padding: '0 4px',
      }}>
        Workflows
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {workflows.map(wf => (
          <WorkflowCard
            key={wf.name}
            workflow={wf}
            expanded={expandedWorkflow === wf.name}
            onToggleExpand={() => setExpandedWorkflow(
              expandedWorkflow === wf.name ? null : wf.name
            )}
            onToggleWorkflow={(newMode) => handleToggleWorkflow(wf.name, newMode)}
            onSlotToggle={(slotRef, newMode) => handleSlotToggle(wf.name, slotRef, newMode)}
          />
        ))}
      </div>
    </div>
  );
}
