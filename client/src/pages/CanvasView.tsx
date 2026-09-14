import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore } from '../store';
import type { AnyEntity, Fact } from '@shared/types';

interface NodeData {
  entity: AnyEntity;
}

function EntityNode({ data }: NodeProps<NodeData>) {
  const e = data.entity;
  const keyCols = e.columns.filter((c) => c.isPk || c.isSk || c.isFk || c.isNaturalKey).slice(0, 8);
  return (
    <div className={`flow-node ${e.kind === 'fact' ? 'fact' : e.kind === 'dimension' ? 'dim' : 'enum'}`}>
      <Handle type="target" position={Position.Left} />
      <div className="fn-head">
        {e.kind === 'fact' ? '⚡' : e.kind === 'dimension' ? '◆' : '#'} {e.name}
      </div>
      <div className="fn-body">
        {keyCols.map((c) => (
          <div className="fn-col" key={c.id}>
            <span className="k">{c.name}</span>
            <span>{c.isSk ? 'SK' : c.isPk ? 'PK' : c.isFk ? 'FK' : c.isNaturalKey ? 'NK' : ''}</span>
          </div>
        ))}
        {e.columns.length > keyCols.length && (
          <div className="fn-col">
            <span>+{e.columns.length - keyCols.length} more…</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

export default function CanvasView() {
  const model = useStore((s) => s.model);
  const updateEntity = useStore((s) => s.updateEntity);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);

  const entities: AnyEntity[] = useMemo(
    () => [...model.enumerations, ...model.dimensions, ...model.facts],
    [model],
  );

  const nodes: Node<NodeData>[] = useMemo(
    () =>
      entities.map((e) => ({
        id: e.id,
        type: 'entity',
        position: { x: e.ui?.x ?? 0, y: e.ui?.y ?? 0 },
        data: { entity: e },
      })),
    [entities],
  );

  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    for (const f of model.facts) {
      const fact = f as Fact;
      for (const dl of fact.dimensionLookups ?? []) {
        if (dl.dimensionId) {
          out.push({
            id: `${fact.id}-dl-${dl.id}`,
            source: dl.dimensionId,
            target: fact.id,
            label: dl.targetSkColumn,
            animated: dl.isMandatory,
            style: { stroke: dl.isMandatory ? '#10b981' : '#64748b' },
          });
        }
      }
      // FK columns that reference an entity but have no explicit lookup
      for (const c of fact.columns) {
        if (c.isFk && c.referencedEntityId) {
          const exists = out.some(
            (e) => e.source === c.referencedEntityId && e.target === fact.id && e.label === c.name,
          );
          if (!exists) {
            out.push({
              id: `${fact.id}-fk-${c.id}`,
              source: c.referencedEntityId,
              target: fact.id,
              label: c.name,
              style: { stroke: '#3b82f6', strokeDasharray: '4 3' },
            });
          }
        }
      }
    }
    return out;
  }, [model.facts]);

  const onNodeDragStop = useCallback<NodeMouseHandler>(
    (_evt, node) => {
      const e = entities.find((x) => x.id === node.id);
      if (e) updateEntity({ ...e, ui: { x: node.position.x, y: node.position.y } });
    },
    [entities, updateEntity],
  );

  const onNodeDoubleClick = useCallback<NodeMouseHandler>(
    (_evt, node) => {
      const e = entities.find((x) => x.id === node.id);
      if (!e) return;
      select(e.id);
      setView(e.kind === 'fact' ? 'facts' : e.kind === 'dimension' ? 'dimensions' : 'enumerations');
    },
    [entities, select, setView],
  );

  return (
    <div>
      <div className="page-head">
        <h1>Star-Schema Canvas</h1>
        <div className="spacer" />
        <span className="hint">Drag to arrange · double-click a node to edit</span>
      </div>
      <div className="canvas-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#2a3a5c" gap={18} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const e = (n.data as NodeData).entity;
              return e.kind === 'fact' ? '#10b981' : e.kind === 'dimension' ? '#3b82f6' : '#8b5cf6';
            }}
            maskColor="rgba(15,23,42,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
