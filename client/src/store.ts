import { create } from 'zustand';
import type {
  AnyEntity,
  AuditFieldProfile,
  DesignModel,
  Dimension,
  Enumeration,
  Fact,
} from '@shared/types';
import { buildSeedModel } from '@shared/seed';
import { newDimension, newEnumeration, newFact } from '@shared/templates';

export type ViewId =
  | 'dashboard'
  | 'enumerations'
  | 'dimensions'
  | 'facts'
  | 'canvas'
  | 'audit'
  | 'json';

const STORAGE_KEY = 'vcdw-designer-model';

function loadFromStorage(): DesignModel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DesignModel) : null;
  } catch {
    return null;
  }
}

function persist(model: DesignModel): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  } catch {
    /* ignore quota errors */
  }
}

interface Store {
  model: DesignModel;
  view: ViewId;
  selectedEntityId: string | null;

  setView: (view: ViewId) => void;
  select: (id: string | null) => void;

  loadSeed: () => void;
  importModel: (model: DesignModel) => void;
  setModel: (model: DesignModel) => void;

  addEntity: (kind: AnyEntity['kind']) => string;
  updateEntity: (entity: AnyEntity) => void;
  deleteEntity: (id: string) => void;

  upsertAuditProfile: (profile: AuditFieldProfile) => void;
  deleteAuditProfile: (id: string) => void;

  getEntity: (id: string) => AnyEntity | undefined;
  allEntities: () => AnyEntity[];
}

function replaceEntity(model: DesignModel, entity: AnyEntity): DesignModel {
  if (entity.kind === 'enumeration') {
    return { ...model, enumerations: model.enumerations.map((e) => (e.id === entity.id ? (entity as Enumeration) : e)) };
  }
  if (entity.kind === 'dimension') {
    return { ...model, dimensions: model.dimensions.map((e) => (e.id === entity.id ? (entity as Dimension) : e)) };
  }
  return { ...model, facts: model.facts.map((e) => (e.id === entity.id ? (entity as Fact) : e)) };
}

export const useStore = create<Store>((set, get) => ({
  model: loadFromStorage() ?? buildSeedModel(),
  view: 'dashboard',
  selectedEntityId: null,

  setView: (view) => set({ view }),
  select: (selectedEntityId) => set({ selectedEntityId }),

  loadSeed: () => {
    const model = buildSeedModel();
    persist(model);
    set({ model, selectedEntityId: null });
  },

  importModel: (model) => {
    persist(model);
    set({ model, selectedEntityId: null });
  },

  setModel: (model) => {
    persist(model);
    set({ model });
  },

  addEntity: (kind) => {
    const model = get().model;
    let entity: AnyEntity;
    let next: DesignModel;
    if (kind === 'enumeration') {
      entity = newEnumeration(`enum_${model.enumerations.length + 1}`);
      next = { ...model, enumerations: [...model.enumerations, entity as Enumeration] };
    } else if (kind === 'dimension') {
      entity = newDimension(`dim_${model.dimensions.length + 1}`);
      next = { ...model, dimensions: [...model.dimensions, entity as Dimension] };
    } else {
      entity = newFact(`dw_fact_${model.facts.length + 1}`);
      next = { ...model, facts: [...model.facts, entity as Fact] };
    }
    persist(next);
    set({ model: next, selectedEntityId: entity.id });
    return entity.id;
  },

  updateEntity: (entity) => {
    const next = replaceEntity(get().model, entity);
    persist(next);
    set({ model: next });
  },

  deleteEntity: (id) => {
    const model = get().model;
    const next: DesignModel = {
      ...model,
      enumerations: model.enumerations.filter((e) => e.id !== id),
      dimensions: model.dimensions.filter((e) => e.id !== id),
      facts: model.facts.filter((e) => e.id !== id),
    };
    persist(next);
    set({ model: next, selectedEntityId: null });
  },

  upsertAuditProfile: (profile) => {
    const model = get().model;
    const exists = model.auditProfiles.some((p) => p.id === profile.id);
    const auditProfiles = exists
      ? model.auditProfiles.map((p) => (p.id === profile.id ? profile : p))
      : [...model.auditProfiles, profile];
    const next = { ...model, auditProfiles };
    persist(next);
    set({ model: next });
  },

  deleteAuditProfile: (id) => {
    const model = get().model;
    const next = { ...model, auditProfiles: model.auditProfiles.filter((p) => p.id !== id) };
    persist(next);
    set({ model: next });
  },

  getEntity: (id) => get().allEntities().find((e) => e.id === id),

  allEntities: () => {
    const m = get().model;
    return [...m.enumerations, ...m.dimensions, ...m.facts];
  },
}));
