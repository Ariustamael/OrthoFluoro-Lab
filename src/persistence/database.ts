import Dexie, { type EntityTable } from "dexie";

export interface SavedView {
  id?: number;
  createdAt: string;
  title: string;
  geometry: string;
}
export interface Bookmark {
  id: string;
  createdAt: string;
}
export interface LearningNote {
  id?: number;
  caseId: string;
  updatedAt: string;
  body: string;
}
export interface LocalSetting {
  key: string;
  value: string;
}
export interface RecentItem {
  id: string;
  viewedAt: string;
}

export class OrthoFluoroDatabase extends Dexie {
  savedViews!: EntityTable<SavedView, "id">;
  bookmarks!: EntityTable<Bookmark, "id">;
  notes!: EntityTable<LearningNote, "id">;
  settings!: EntityTable<LocalSetting, "key">;
  recentItems!: EntityTable<RecentItem, "id">;

  constructor() {
    super("orthofluoro-lab");
    this.version(1).stores({
      savedViews: "++id, createdAt, title",
      bookmarks: "id, createdAt",
      notes: "++id, caseId, updatedAt",
      settings: "key",
      recentItems: "id, viewedAt",
    });
  }
}

let database: OrthoFluoroDatabase | undefined;
export function getDatabase(): OrthoFluoroDatabase {
  database ??= new OrthoFluoroDatabase();
  return database;
}
