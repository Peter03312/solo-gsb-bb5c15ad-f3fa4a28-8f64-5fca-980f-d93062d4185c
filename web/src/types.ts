export interface CellView {
  msId: number;
  missing: boolean;
  broken: boolean;
  lineNo?: number;
  startCp?: number;
  endCp?: number;
  text?: string;
  oobEnd?: number;
}

export interface GroupView {
  id: number;
  ord: number;
  broken: boolean;
  baseText: string;
  inverted: boolean;
  cells: CellView[];
  variant: boolean;
  hasMissing: boolean;
}

export interface CoveredSpan {
  startCp: number;
  endCp: number;
  groupId: number;
  broken: boolean;
}

export interface RawLineView {
  lineId: number;
  lineNo: number;
  content: string;
  covered: CoveredSpan[];
}

export interface CollationView {
  document: {
    id: number;
    title: string;
    version: number;
    baseMsId: number | null;
    publishedVer: number;
  };
  manuscripts: Array<{ id: number; name: string; position: number; isBase: boolean }>;
  groups: GroupView[];
  rawByMs: Array<{ msId: number; lines: RawLineView[] }>;
  stats: { manuscriptCount: number; lineCount: number; groupCount: number; brokenCount: number };
}

export interface FragmentDraft {
  msId: number;
  missing: boolean;
  lineId?: number | null;
  startCp?: number | null;
  endCp?: number | null;
}

export interface GroupDraft {
  key: string;            // 前端临时键
  ord: number;
  serverId?: number;      // 已保存组的服务端 id
  serverBroken?: boolean; // 该已保存组当前是否待修复
  fragments: FragmentDraft[];
}

export interface DocumentSummary {
  id: number;
  title: string;
  version: number;
  published_ver: number;
  base_ms_id: number | null;
  ms_count: number;
  broken_count: number;
}

export interface EditionSummary {
  id: number;
  edition_no: number;
  created_at: string;
}

// ---- 版本对照（已发布校勘版 vs 当前工作版） ----

export type DiffOp = 'eq' | 'ins' | 'del';

export interface CharChange {
  op: DiffOp;
  text: string;
}

export type CellStatus = 'text' | 'missing' | 'absent' | 'broken';

export interface CellChange {
  msId: number;
  msName: string;
  oldStatus: CellStatus;
  newStatus: CellStatus;
  changed: boolean;
  oldText?: string;
  newText?: string;
  oldLineNo?: number;
  newLineNo?: number;
  oldStartCp?: number;
  oldEndCp?: number;
  newStartCp?: number;
  newEndCp?: number;
  newOobEnd?: number;
  charChanges: CharChange[] | null;
}

export interface PairedGroupChange {
  kind: 'paired';
  oldOrd: number;
  newOrd: number;
  ordChanged: boolean;
  changed: boolean;
  oldBroken: boolean;
  newBroken: boolean;
  oldBaseText: string;
  newBaseText: string;
  cells: CellChange[];
}

export interface UnpairedCell {
  msId: number;
  msName: string;
  status: CellStatus;
  text?: string;
  lineNo?: number;
  startCp?: number;
  endCp?: number;
  oobEnd?: number;
}

export type UnpairedReason = 'base-mismatch' | 'duplicate-key' | 'unmatched' | 'broken-base';

export interface UnpairedGroupChange {
  kind: 'unpaired';
  side: 'old' | 'new';
  ord: number;
  groupId?: number;
  broken: boolean;
  reason: UnpairedReason;
  baseText: string;
  baseLineNo?: number;
  baseStartCp?: number;
  baseEndCp?: number;
  cells: UnpairedCell[];
}

export interface LineChange {
  msId: number;
  msName: string;
  lineNo: number;
  kind: 'modified' | 'added' | 'removed';
  changes: CharChange[];
}

export interface ManuscriptChange {
  msId: number;
  oldName: string | null;
  newName: string | null;
  kind: 'same' | 'added' | 'removed' | 'renamed';
}

export interface EditionDiff {
  documentId: number;
  title: string;
  baseChanged: boolean;
  oldSide: {
    editionNo: number;
    createdAt: string | null;
    version: number;
    baseMsId: number | null;
    baseMsName: string | null;
  };
  newSide: {
    version: number;
    baseMsId: number | null;
    baseMsName: string | null;
  };
  manuscripts: ManuscriptChange[];
  lineChanges: LineChange[];
  pairedGroups: PairedGroupChange[];
  unpairedOldGroups: UnpairedGroupChange[];
  unpairedNewGroups: UnpairedGroupChange[];
  stats: {
    pairedCount: number;
    pairedChangedCount: number;
    unpairedOldCount: number;
    unpairedNewCount: number;
    linesModified: number;
    linesAdded: number;
    linesRemoved: number;
  };
}
