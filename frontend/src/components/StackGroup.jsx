import React, { useState } from 'react';
import ContainerRow from './ContainerRow';
import AddServicePanel from './AddServicePanel';

export default function StackGroup({ env, stack, stackIdx, selected, onToggle, onRefresh }) {
  const [addOpen, setAddOpen] = useState(false);

  const runningCount = stack.containers.filter(c => c.status === 'running').length;

  return (
    <div className="stack-group">
      <div className="stack-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="stack-name">{stack.name}</span>
          <span className="stack-count">{stack.containers.length} containers · {runningCount} running</span>
        </div>
        <button
          className="btn"
          style={{ fontSize: 10, color: 'var(--blue)' }}
          onClick={() => setAddOpen(true)}
        >
          + Add Service
        </button>
      </div>
      <div>
        {stack.containers.map(c => (
          <ContainerRow
            key={c.name}
            env={env}
            container={c}
            stackPath={stack.path}
            checked={selected.has(c.name)}
            onToggle={() => onToggle(c.name)}
            onRefresh={onRefresh}
          />
        ))}
      </div>
      {addOpen && (
        <AddServicePanel
          env={env}
          stackIdx={stackIdx}
          stackPath={stack.path}
          existingServices={stack.containers}
          onClose={() => setAddOpen(false)}
          onDone={onRefresh}
        />
      )}
    </div>
  );
}
