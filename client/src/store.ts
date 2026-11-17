import { create } from 'zustand';
import type {
  AnyEntity,
  AuditFieldProfile,
  DesignModel,
  Dimension,
  Enumeration,
  EntityKind,
  Fact,
} from '@shared/types';
import { buildSeedModel } from '@shared/seed';
import { newDimension, newEnumeration, newFact, uid } from '@shared/templates';
import { stripLegacyEnumOverrides } from '@shared/enumNaming';
import { saveEnumerationDesign, saveEntityDesign, fetchEnumCatalog, fetchEntityCatalog } from './api';

export type ViewId =
  | 'dashboard'
  | 'working'
  | 'enumerations'
  | 'dimensions'
  | 'facts'
  | 'support'
  | 'audit'
  | 'json'
  | 'train';

/** A tab is either a fixed section view or a per-entity editor. */
export type TabKind = ViewId | 'entity';

export interface Tab {
  /** Stable id: `view:<viewId>` for sections, `entity:<entityId>` for editors. */
  id: string;
  kind: TabKind;
  /** Fallback title; entity tabs derive their live title from the model. */
  title: string;
  /** Present when kind === 'entity'. */
  entityId?: string;
  closable: boolean;
}

export const VIEW_TITLES: Record<ViewId, string> = {
  dashboard: 'Dashboard',
  working: 'Working Area',
  enumerations: 'Enumerations',
  dimensions: 'Dimensions',
  facts: 'Facts',
  support: 'Support Tables',
  audit: 'Audit Profiles',
  json: 'JSON & SQL',
  train: 'Train / Sources',
};

const STORAGE_KEY = 'vcdw-designer-model';
const TABS_KEY = 'vcdw-designer-tabs';
const RECENTS_KEY = 'vcdw-designer-recents';
const RECENTS_MAX = 12;
const WORKINGSET_KEY = 'vcdw-designer-workingset';
const WORKINGIDS_KEY = 'vcdw-designer-workingids';
const BASELINES_KEY = 'vcdw-designer-baselines';
const FAVENUM_KEY = 'vcdw-designer-fav-enums';
const RECENTENUM_KEY = 'vcdw-designer-recent-enums';
const RECENTENUM_MAX = 12;

/** An entity that was open and later closed; can be reopened from the Working Area. */
export interface RecentItem {
  id: string;
  name: string;
  kind: EntityKind;
  closedAt: number;
}

/**
 * A table the user pulled into the Working Area so its name and columns become
 * selectable inside other objects' joins / mappings / lookups. Users can always
 * still type free table & column names; the working set just enables the pickers.
 */
export interface WorkingTable {
  /** Physical table name used in SQL. */
  name: string;
  /** Suggested alias. */
  alias?: string;
  /** Where the table comes from. */
  origin: 'enumeration' | 'dimension' | 'fact' | 'support';
  /** Declared columns (best-effort; empty is fine). */
  columns: { name: string; type?: string }[];
}

function loadWorkingSet(): WorkingTable[] {
  try {
    const raw = localStorage.getItem(WORKINGSET_KEY);
    const parsed = raw ? (JSON.parse(raw) as WorkingTable[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistWorkingSet(set: WorkingTable[]): void {
  try {
    localStorage.setItem(WORKINGSET_KEY, JSON.stringify(set));
  } catch {
    /* ignore quota errors */
  }
}

/** Generic string-list persistence used for working ids, favorites and recents. */
function loadStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistStringList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

function loadBaselines(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BASELINES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistBaselines(baselines: Record<string, string>): void {
  try {
    localStorage.setItem(BASELINES_KEY, JSON.stringify(baselines));
  } catch {
    /* ignore quota errors */
  }
}

/** Stable JSON snapshot of an entity, ignoring transient UI position. */
function entitySnapshot(entity: AnyEntity): string {
  const { ui: _ui, ...rest } = entity as AnyEntity & { ui?: unknown };
  return JSON.stringify(rest);
}

/**
 * Make an entity self-contained before saving: any net-change source that
 * references a working-set table but declares no columns gets that table's
 * columns embedded, so the saved YAML never depends on other files.
 */
function enrichSelfContained(entity: AnyEntity, workingSet: WorkingTable[]): AnyEntity {
  if (!entity.netChange || entity.netChange.length === 0) return entity;
  const byName = new Map(workingSet.map((t) => [t.name.toLowerCase(), t]));
  let changed = false;
  const netChange = entity.netChange.map((s) => {
    if (s.columns && s.columns.length > 0) return s;
    const table =
      byName.get((s.ncTable ?? '').toLowerCase()) ??
      byName.get((s.oltpTable ?? '').toLowerCase());
    if (!table || table.columns.length === 0) return s;
    changed = true;
    return {
      ...s,
      columns: table.columns.map((c) => ({ id: uid('sc'), name: c.name, type: c.type })),
    };
  });
  return changed ? { ...entity, netChange } : entity;
}

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistRecents(recents: RecentItem[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    /* ignore quota errors */
  }
}

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

function dashboardTab(): Tab {
  return { id: 'view:dashboard', kind: 'dashboard', title: VIEW_TITLES.dashboard, closable: false };
}

function loadTabs(): { tabs: Tab[]; activeTabId: string } {
  const fallback = { tabs: [dashboardTab()], activeTabId: 'view:dashboard' };
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { tabs: Tab[]; activeTabId: string };
    if (!parsed.tabs?.length) return fallback;
    if (!parsed.tabs.some((t) => t.id === 'view:dashboard')) parsed.tabs.unshift(dashboardTab());
    const activeExists = parsed.tabs.some((t) => t.id === parsed.activeTabId);
    return { tabs: parsed.tabs, activeTabId: activeExists ? parsed.activeTabId : parsed.tabs[0].id };
  } catch {
    return fallback;
  }
}

function persistTabs(tabs: Tab[], activeTabId: string): void {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, activeTabId }));
  } catch {
    /* ignore quota errors */
  }
}

interface Store {
  model: DesignModel;
  tabs: Tab[];
  activeTabId: string;
  recents: RecentItem[];
  workingSet: WorkingTable[];
  /** Ids of entities currently in the Working Area's working set. */
  workingIds: string[];
  /** Last-saved JSON snapshot per entity id, for dirty detection. */
  baselines: Record<string, string>;
  /** Favorite enumeration names (Enumerations tab). */
  favoriteEnums: string[];
  /** Recently opened enumeration names (Enumerations tab). */
  recentEnums: string[];
  /** Real entity counts from the file-backed catalog (server). */
  catalogCounts: { enumerations: number; dimensions: number; facts: number };

  /** Fetch the real catalog counts from the server. */
  refreshCatalogCounts: () => Promise<void>;

  openView: (view: ViewId) => void;
  openEntity: (id: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;

  /** Remove an item from the recents list. */
  removeRecent: (id: string) => void;

  /** Add (or replace by name) a referenceable table into the Working Area. */
  addWorkingTable: (table: WorkingTable) => void;
  /** Remove a table from the Working Area by name. */
  removeWorkingTable: (name: string) => void;

  /** Add an entity id to the Working Area's working set. */
  addToWorking: (id: string) => void;
  /** Remove an entity from the Working Area (drops in-session changes). */
  removeFromWorking: (id: string) => void;
  /** Empty the Working Area, discarding all in-session objects & changes. */
  clearWorkingArea: () => void;
  /** True when an entity has unsaved changes (new, or differs from last save). */
  isDirty: (id: string) => boolean;

  /** Toggle an enumeration name in/out of favorites. */
  toggleFavoriteEnum: (name: string) => void;
  /** Record an enumeration name as recently used. */
  noteEnumUsed: (name: string) => void;

  /** Persist an entity to the file-backed library (enum/dim/fact) + local model. */
  saveObject: (id: string) => Promise<void>;

  /** Compat helpers kept so existing pages need minimal changes. */
  setView: (view: ViewId) => void;
  select: (id: string | null) => void;
  activeTab: () => Tab | undefined;

  loadSeed: () => void;
  importModel: (model: DesignModel) => void;
  setModel: (model: DesignModel) => void;

  addEntity: (kind: AnyEntity['kind']) => string;
  updateEntity: (entity: AnyEntity) => void;
  deleteEntity: (id: string) => void;

  /** Insert (or replace by name) a fully-formed enumeration design and open it. */
  addEnumerationDesign: (design: Enumeration, opts?: DesignOpts) => string;

  /** Insert (or replace by name within its kind) any full design and open it. */
  addDesign: (design: AnyEntity, opts?: DesignOpts) => string;

  /** Clone a design under a new name into the Working Area (unsaved) and open it. */
  duplicateDesign: (design: AnyEntity, newName: string) => string;

  upsertAuditProfile: (profile: AuditFieldProfile) => void;
  deleteAuditProfile: (id: string) => void;

  getEntity: (id: string) => AnyEntity | undefined;
  allEntities: () => AnyEntity[];
}

/** Options controlling how a design enters the model / Working Area. */
export interface DesignOpts {
  /** Add the entity to the Working Area's working set. */
  working?: boolean;
  /** Treat as unsaved (no baseline) so it shows as dirty; implies working. */
  dirty?: boolean;
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

/** Pick the tab to activate after `closedId` is removed from `tabs`. */
function neighborTabId(tabs: Tab[], closedId: string): string {
  const idx = tabs.findIndex((t) => t.id === closedId);
  const remaining = tabs.filter((t) => t.id !== closedId);
  if (remaining.length === 0) return 'view:dashboard';
  const next = remaining[Math.min(idx, remaining.length - 1)];
  return next.id;
}

const initialTabs = loadTabs();

export const useStore = create<Store>((set, get) => ({
  model: loadFromStorage() ?? buildSeedModel(),
  tabs: initialTabs.tabs,
  activeTabId: initialTabs.activeTabId,
  recents: loadRecents(),
  workingSet: loadWorkingSet(),
  workingIds: loadStringList(WORKINGIDS_KEY),
  baselines: loadBaselines(),
  favoriteEnums: loadStringList(FAVENUM_KEY),
  recentEnums: loadStringList(RECENTENUM_KEY),
  catalogCounts: { enumerations: 0, dimensions: 0, facts: 0 },

  refreshCatalogCounts: async () => {
    try {
      const [en, dim, fact] = await Promise.all([
        fetchEnumCatalog(),
        fetchEntityCatalog('dimension'),
        fetchEntityCatalog('fact'),
      ]);
      set({
        catalogCounts: {
          enumerations: en.rows.length,
          dimensions: dim.rows.length,
          facts: fact.rows.length,
        },
      });
    } catch {
      /* server offline: keep the last known counts */
    }
  },

  openView: (view) => {
    const id = `view:${view}`;
    const { tabs } = get();
    const exists = tabs.some((t) => t.id === id);
    const nextTabs = exists
      ? tabs
      : [...tabs, { id, kind: view, title: VIEW_TITLES[view], closable: view !== 'dashboard' }];
    persistTabs(nextTabs, id);
    set({ tabs: nextTabs, activeTabId: id });
  },

  openEntity: (entityId) => {
    const id = `entity:${entityId}`;
    const { tabs } = get();
    const entity = get().getEntity(entityId);
    const title = entity?.name ?? 'Entity';
    const exists = tabs.some((t) => t.id === id);
    const nextTabs = exists
      ? tabs
      : [...tabs, { id, kind: 'entity' as const, title, entityId, closable: true }];
    persistTabs(nextTabs, id);
    const recents = get().recents.filter((r) => r.id !== entityId);
    if (recents.length !== get().recents.length) persistRecents(recents);
    set({ tabs: nextTabs, activeTabId: id, recents });
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const closing = tabs.find((t) => t.id === id);
    const nextActive = activeTabId === id ? neighborTabId(tabs, id) : activeTabId;
    const nextTabs = tabs.filter((t) => t.id !== id);
    persistTabs(nextTabs, nextActive);
    // Closing a tab never destroys Working Area changes: entities in the working
    // set stay in the model. Entities opened only for viewing (not in the working
    // set) are dropped from the in-session model to keep it clean.
    if (closing?.kind === 'entity' && closing.entityId) {
      const entityId = closing.entityId;
      const entity = get().getEntity(entityId);
      if (entity) {
        const item: RecentItem = {
          id: entity.id,
          name: entity.name,
          kind: entity.kind,
          closedAt: Date.now(),
        };
        const recents = [item, ...get().recents.filter((r) => r.id !== entity.id)].slice(
          0,
          RECENTS_MAX,
        );
        persistRecents(recents);
        if (!get().workingIds.includes(entityId)) {
          const model = get().model;
          const next: DesignModel = {
            ...model,
            enumerations: model.enumerations.filter((e) => e.id !== entityId),
            dimensions: model.dimensions.filter((e) => e.id !== entityId),
            facts: model.facts.filter((e) => e.id !== entityId),
          };
          persist(next);
          const baselines = { ...get().baselines };
          delete baselines[entityId];
          persistBaselines(baselines);
          set({ tabs: nextTabs, activeTabId: nextActive, recents, model: next, baselines });
          return;
        }
        set({ tabs: nextTabs, activeTabId: nextActive, recents });
        return;
      }
    }
    set({ tabs: nextTabs, activeTabId: nextActive });
  },

  activateTab: (id) => {
    persistTabs(get().tabs, id);
    set({ activeTabId: id });
  },

  removeRecent: (id) => {
    const recents = get().recents.filter((r) => r.id !== id);
    persistRecents(recents);
    set({ recents });
  },

  addWorkingTable: (table) => {
    const set0 = get().workingSet.filter((t) => t.name.toLowerCase() !== table.name.toLowerCase());
    const next = [...set0, table];
    persistWorkingSet(next);
    set({ workingSet: next });
  },

  removeWorkingTable: (name) => {
    const next = get().workingSet.filter((t) => t.name.toLowerCase() !== name.toLowerCase());
    persistWorkingSet(next);
    set({ workingSet: next });
  },

  addToWorking: (id) => {
    if (get().workingIds.includes(id)) return;
    const next = [...get().workingIds, id];
    persistStringList(WORKINGIDS_KEY, next);
    set({ workingIds: next });
  },

  removeFromWorking: (id) => {
    const workingIds = get().workingIds.filter((x) => x !== id);
    persistStringList(WORKINGIDS_KEY, workingIds);
    const model = get().model;
    const next: DesignModel = {
      ...model,
      enumerations: model.enumerations.filter((e) => e.id !== id),
      dimensions: model.dimensions.filter((e) => e.id !== id),
      facts: model.facts.filter((e) => e.id !== id),
    };
    persist(next);
    const baselines = { ...get().baselines };
    delete baselines[id];
    persistBaselines(baselines);
    set({ workingIds, model: next, baselines });
    get().closeTab(`entity:${id}`);
  },

  clearWorkingArea: () => {
    const ids = new Set(get().workingIds);
    if (ids.size === 0) return;
    const model = get().model;
    const next: DesignModel = {
      ...model,
      enumerations: model.enumerations.filter((e) => !ids.has(e.id)),
      dimensions: model.dimensions.filter((e) => !ids.has(e.id)),
      facts: model.facts.filter((e) => !ids.has(e.id)),
    };
    persist(next);
    const baselines = { ...get().baselines };
    for (const id of ids) delete baselines[id];
    persistBaselines(baselines);
    persistStringList(WORKINGIDS_KEY, []);
    // Close any open editor tabs for the cleared entities.
    const remainingTabs = get().tabs.filter(
      (t) => !(t.kind === 'entity' && t.entityId && ids.has(t.entityId)),
    );
    const activeStillExists = remainingTabs.some((t) => t.id === get().activeTabId);
    const activeTabId = activeStillExists ? get().activeTabId : 'view:working';
    if (!remainingTabs.some((t) => t.id === 'view:working')) {
      remainingTabs.push({ id: 'view:working', kind: 'working', title: VIEW_TITLES.working, closable: true });
    }
    persistTabs(remainingTabs, activeTabId);
    set({ workingIds: [], model: next, baselines, tabs: remainingTabs, activeTabId });
  },

  isDirty: (id) => {
    const entity = get().getEntity(id);
    if (!entity) return false;
    const base = get().baselines[id];
    return !base || base !== entitySnapshot(entity);
  },

  toggleFavoriteEnum: (name) => {
    const key = name.toLowerCase();
    const exists = get().favoriteEnums.some((n) => n.toLowerCase() === key);
    const next = exists
      ? get().favoriteEnums.filter((n) => n.toLowerCase() !== key)
      : [...get().favoriteEnums, name];
    persistStringList(FAVENUM_KEY, next);
    set({ favoriteEnums: next });
  },

  noteEnumUsed: (name) => {
    const next = [name, ...get().recentEnums.filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(
      0,
      RECENTENUM_MAX,
    );
    persistStringList(RECENTENUM_KEY, next);
    set({ recentEnums: next });
  },

  saveObject: async (id) => {
    const entity0 = get().getEntity(id);
    if (!entity0) return;
    // Embed referenced table columns so the saved file is self-contained.
    const entity = enrichSelfContained(entity0, get().workingSet);
    if (entitySnapshot(entity) !== entitySnapshot(entity0)) {
      const nextModel = replaceEntity(get().model, entity);
      persist(nextModel);
      set({ model: nextModel });
    }
    if (entity.kind === 'enumeration') {
      await saveEnumerationDesign(entity as Enumeration);
    } else {
      await saveEntityDesign(entity as Dimension | Fact);
    }
    // Saved objects stay in the working area but become clean (new baseline).
    const baselines = { ...get().baselines, [id]: entitySnapshot(entity) };
    persistBaselines(baselines);
    const workingIds = get().workingIds.includes(id) ? get().workingIds : [...get().workingIds, id];
    persistStringList(WORKINGIDS_KEY, workingIds);
    set({ baselines, workingIds });
    // Saving upserts the catalog row; refresh the real counts.
    void get().refreshCatalogCounts();
  },

  setView: (view) => get().openView(view),
  select: (id) => {
    if (id) get().openEntity(id);
  },
  activeTab: () => get().tabs.find((t) => t.id === get().activeTabId),

  loadSeed: () => {
    const model = buildSeedModel();
    persist(model);
    set({ model });
    get().openView('dashboard');
  },

  importModel: (model) => {
    persist(model);
    set({ model });
    get().openView('dashboard');
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
    // New objects live in the Working Area (not the catalog) until saved — no
    // baseline means they are considered dirty/unsaved.
    const workingIds = [...get().workingIds, entity.id];
    persistStringList(WORKINGIDS_KEY, workingIds);
    set({ model: next, workingIds });
    get().openEntity(entity.id);
    return entity.id;
  },

  updateEntity: (entity) => {
    const next = replaceEntity(get().model, entity);
    persist(next);
    const tabId = `entity:${entity.id}`;
    const tabs = get().tabs.map((t) => (t.id === tabId ? { ...t, title: entity.name } : t));
    persistTabs(tabs, get().activeTabId);
    // Any modified object joins the Working Area automatically.
    const workingIds = get().workingIds.includes(entity.id)
      ? get().workingIds
      : [...get().workingIds, entity.id];
    if (workingIds !== get().workingIds) persistStringList(WORKINGIDS_KEY, workingIds);
    set({ model: next, tabs, workingIds });
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
    set({ model: next });
    get().closeTab(`entity:${id}`);
  },

  addEnumerationDesign: (design, opts) => {
    return get().addDesign({ ...design, kind: 'enumeration' } as Enumeration, opts);
  },

  addDesign: (design, opts) => {
    const model = get().model;
    const list: AnyEntity[] =
      design.kind === 'enumeration'
        ? model.enumerations
        : design.kind === 'dimension'
          ? model.dimensions
          : model.facts;
    const existing = list.find((e) => e.name.toLowerCase() === design.name.toLowerCase());
    const id = existing?.id ?? design.id ?? uid(design.kind);
    const withId = { ...design, id } as AnyEntity;
    const next = existing
      ? replaceEntity(model, withId)
      : design.kind === 'enumeration'
        ? { ...model, enumerations: [...model.enumerations, withId as Enumeration] }
        : design.kind === 'dimension'
          ? { ...model, dimensions: [...model.dimensions, withId as Dimension] }
          : { ...model, facts: [...model.facts, withId as Fact] };
    persist(next);
    const patch: Partial<Store> = { model: next };
    // A design loaded from the catalog is clean (baseline = itself); a duplicate
    // or brand-new design is dirty (no baseline).
    if (!opts?.dirty) {
      const baselines = { ...get().baselines, [id]: entitySnapshot(withId) };
      persistBaselines(baselines);
      patch.baselines = baselines;
    }
    if (opts?.working || opts?.dirty) {
      const workingIds = get().workingIds.includes(id) ? get().workingIds : [...get().workingIds, id];
      persistStringList(WORKINGIDS_KEY, workingIds);
      patch.workingIds = workingIds;
    }
    set(patch);
    get().openEntity(id);
    return id;
  },

  duplicateDesign: (design, newName) => {
    let clone = JSON.parse(JSON.stringify(design)) as AnyEntity;
    if (clone.kind === 'enumeration') clone = stripLegacyEnumOverrides(clone);
    clone.id = uid(design.kind);
    clone.name = newName;
    delete (clone as AnyEntity & { ui?: unknown }).ui;
    return get().addDesign(clone, { dirty: true });
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
