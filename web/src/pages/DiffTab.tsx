import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type {
  CellChange,
  CharChange,
  EditionDiff,
  EditionSummary,
  LineChange,
  UnpairedCell,
  UnpairedGroupChange,
  UnpairedReason,
} from '../types';

/**
 * 版本对照页签：任一已发布校勘版（旧）↔ 当前工作版（新）。
 *  - 行文增删改按抄本原始行号呈现（逐码点对齐）；
 *  - 组对照：同底本且底本片段位置唯一对应才配对，否则旧/新分列未配对；
 *  - 待修复组显式标识，越界片段不当作确定文字；
 *  - 只读：不改动工作版与快照；“刷新对照”重新拉取最新工作版。
 */
export function DiffTab({
  docId,
  editions,
  initialNo,
  onError,
  onNotice,
}: {
  docId: number;
  editions: EditionSummary[];
  initialNo?: number | null;
  onError: (msg: string, details?: unknown) => void;
  onNotice: (msg: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(initialNo ?? null);
  const [diff, setDiff] = useState<EditionDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (no: number) => {
      setLoading(true);
      try {
        const d = await api.getEditionDiff(docId, no);
        setDiff(d);
        const s = d.stats;
        const unchanged =
          s.pairedChangedCount === 0 &&
          s.unpairedOldCount === 0 &&
          s.unpairedNewCount === 0 &&
          d.lineChanges.length === 0 &&
          !d.baseChanged;
        if (unchanged) onNotice(`第 ${no} 版与当前工作版完全一致，无变更。`);
      } catch (e) {
        setDiff(null);
        if (e instanceof ApiError) onError(e.message, e.details);
        else onError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [docId, onError, onNotice]
  );

  useEffect(() => {
    if (selected != null) load(selected);
    else setDiff(null);
  }, [selected, reloadKey, load]);

  if (editions.length === 0) {
    return (
      <div className="card">
        <h2>版本对照</h2>
        <div className="muted">尚无已发布校勘版，无法对照。请先在“发布与旧版”页签发布一个校勘版。</div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>版本对照（已发布校勘版 ↔ 当前工作版）</h2>
        <div className="row-flex">
          <label className="muted">选择已发布校勘版：</label>
          <select
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">— 请选择 —</option>
            {editions.map((e) => (
              <option key={e.id} value={e.edition_no}>
                第 {e.edition_no} 版（{new Date(e.created_at).toLocaleString('zh-CN')}）
              </option>
            ))}
          </select>
          <button disabled={selected == null || loading} onClick={() => setReloadKey((k) => k + 1)}>
            刷新对照
          </button>
          <span className="muted">只读对照：不会修改工作版或任何旧版快照。</span>
        </div>
      </div>

      {loading && <div className="card muted">正在生成对照…</div>}

      {diff && (
        <>
          <div className="card diff-sides">
            <div className="diff-side">
              <div className="diff-side-tag">旧版（快照）</div>
              <strong>第 {diff.oldSide.editionNo} 版</strong>
              <span className="muted">
                {diff.oldSide.createdAt ? new Date(diff.oldSide.createdAt).toLocaleString('zh-CN') : ''}
              </span>
              <div className="muted">
                工作版版本号 v{diff.oldSide.version} · 底本：
                {diff.oldSide.baseMsName ?? '未选定'}
              </div>
            </div>
            <div className="diff-arrow">→</div>
            <div className="diff-side">
              <div className="diff-side-tag">当前工作版</div>
              <strong>进行中</strong>
              <div className="muted">
                工作版版本号 v{diff.newSide.version} · 底本：
                {diff.newSide.baseMsName ?? '未选定'}
              </div>
            </div>
          </div>

          {diff.baseChanged && (
            <div className="notice-box">
              ⚠ 两侧底本不同（旧版底本「{diff.oldSide.baseMsName ?? '—'}」→ 工作版底本「
              {diff.newSide.baseMsName ?? '—'}」）：所有旧组与新组分别列于“未配对”，
              不做任何配对或移动推断。
            </div>
          )}

          <DiffSummary diff={diff} />

          <div className="card">
            <h3>一、行文增删改（按抄本原始行号）</h3>
            {diff.lineChanges.length === 0 && <div className="muted">各行原文与旧版完全一致。</div>}
            {diff.lineChanges.map((l, i) => (
              <LineDiffRow key={`${l.msId}-${l.lineNo}-${l.kind}-${i}`} l={l} />
            ))}
          </div>

          <div className="card">
            <h3>二、对应组变化</h3>

            <h4>已配对（{diff.stats.pairedCount} 组，其中 {diff.stats.pairedChangedCount} 组有变化）</h4>
            <div className="muted" style={{ marginBottom: 8 }}>
              配对依据：底本相同且底本片段在原始行号上的位置（行号 + 码点区间）两侧唯一对应；
              不使用组 ID（整批重存会更换组 ID）。
            </div>
            {diff.pairedGroups.length === 0 && <div className="muted">无配对组。</div>}
            {diff.pairedGroups.map((g) => (
              <PairedGroupRow key={`${g.oldOrd}-${g.newOrd}`} g={g} />
            ))}

            <div className="diff-unpaired-grid">
              <div>
                <h4>未配对旧组（{diff.unpairedOldGroups.length}）</h4>
                {diff.unpairedOldGroups.map((g, i) => (
                  <UnpairedGroupRow key={`o-${i}`} g={g} />
                ))}
              </div>
              <div>
                <h4>未配对新组（{diff.unpairedNewGroups.length}）</h4>
                {diff.unpairedNewGroups.map((g, i) => (
                  <UnpairedGroupRow key={`n-${i}`} g={g} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DiffSummary({ diff }: { diff: EditionDiff }) {
  const s = diff.stats;
  const msAdded = diff.manuscripts.filter((m) => m.kind === 'added').length;
  const msRemoved = diff.manuscripts.filter((m) => m.kind === 'removed').length;
  const msRenamed = diff.manuscripts.filter((m) => m.kind === 'renamed').length;
  const total =
    s.pairedChangedCount + s.unpairedOldCount + s.unpairedNewCount + diff.lineChanges.length;
  return (
    <div className="card diff-summary">
      <strong>变更概览：</strong>
      <span>配对组有变化 {s.pairedChangedCount}</span>
      <span>未配对旧组 {s.unpairedOldCount}</span>
      <span>未配对新组 {s.unpairedNewCount}</span>
      <span>行改 {s.linesModified}</span>
      <span>行增 {s.linesAdded}</span>
      <span>行删 {s.linesRemoved}</span>
      {(msAdded + msRemoved + msRenamed > 0 || diff.baseChanged) && (
        <span>
          抄本增 {msAdded} / 删 {msRemoved} / 改名 {msRenamed}
          {diff.baseChanged ? '；底本已切换' : ''}
        </span>
      )}
      {total === 0 && !diff.baseChanged && <span className="muted">与旧版完全一致</span>}
    </div>
  );
}

function LineDiffRow({ l }: { l: LineChange }) {
  const label =
    l.kind === 'modified' ? '改' : l.kind === 'added' ? '增' : '删';
  return (
    <div className={`diff-line diff-line-${l.kind}`}>
      <span className="diff-line-head">
        <span className={`pill diffkind diffkind-${l.kind}`}>{label}</span>
        {l.msName} · 第 {l.lineNo} 行
      </span>
      <span className="diff-line-text">
        {l.changes.map((c, i) => (
          <CharSpan key={i} c={c} />
        ))}
        {l.changes.length === 0 && <span className="muted">（空行）</span>}
      </span>
    </div>
  );
}

function CharSpan({ c }: { c: CharChange }) {
  if (c.op === 'eq') return <span>{c.text}</span>;
  if (c.op === 'ins') return <span className="diff-ins">{c.text}</span>;
  return <span className="diff-del">{c.text}</span>;
}

function locText(lineNo?: number, s?: number, e?: number): string {
  if (lineNo == null || s == null || e == null) return '';
  return `第${lineNo}行[${s},${e})`;
}

function PairedGroupRow({ g }: { g: EditionDiff['pairedGroups'][number] }) {
  return (
    <div className={`diff-group ${g.changed ? 'diff-group-changed' : ''}`}>
      <div className="diff-group-head">
        组序：旧 #{g.oldOrd} → 新 #{g.newOrd}
        {g.ordChanged && <span className="pill invert">组序变化</span>}
        {g.newBroken && <span className="pill broken">新侧待修复</span>}
        {!g.changed && <span className="muted">（无变化）</span>}
      </div>
      <table className="diff-cell-table">
        <tbody>
          {g.cells.map((c) => (
            <CellChangeRow key={c.msId} c={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellChangeRow({ c }: { c: CellChange }) {
  const oldLoc = locText(c.oldLineNo, c.oldStartCp, c.oldEndCp);
  const newLoc = locText(c.newLineNo, c.newStartCp, c.newEndCp);
  return (
    <tr className={c.changed ? 'cell-changed' : undefined}>
      <td className="cell-msname">{c.msName}</td>
      <td className="cell-side">
        <CellText status={c.oldStatus} text={c.oldText} loc={oldLoc} />
      </td>
      <td className="cell-side">
        <CellText
          status={c.newStatus}
          text={c.newText}
          loc={newLoc}
          oobEnd={c.newOobEnd}
        />
      </td>
    </tr>
  );
}

function CellText({
  status,
  text,
  loc,
  oobEnd,
}: {
  status: string;
  text?: string;
  loc?: string;
  oobEnd?: number;
}) {
  if (status === 'absent') return <span className="muted">—（无片段）</span>;
  if (status === 'missing') return <span className="cell-missing">〔缺文〕</span>;
  if (status === 'broken') {
    return (
      <span>
        {text !== undefined && <span className="diff-oob">{text}</span>}
        <span className="cell-broken-note">
          待修复：片段越界或引用失效{oobEnd != null ? `（原文现存至第 ${oobEnd} 字）` : ''}，
          越界部分不作为确定文字
        </span>
        {loc && <span className="muted"> {loc}</span>}
      </span>
    );
  }
  return (
    <span>
      <span className="cell-text">{text}</span>
      {loc && <span className="muted"> {loc}</span>}
    </span>
  );
}

const REASON_TEXT: Record<UnpairedReason, string> = {
  'base-mismatch': '底本不同',
  'duplicate-key': '底本片段位置不唯一',
  unmatched: '底本片段位置无对应',
  'broken-base': '待修复：底本片段位置失效',
};

function UnpairedGroupRow({ g }: { g: UnpairedGroupChange }) {
  return (
    <div className={`diff-group diff-unpaired ${g.broken ? 'broken-row' : ''}`}>
      <div className="diff-group-head">
        {g.side === 'old' ? '旧' : '新'}组 #{g.ord}
        <span className="pill missing">{REASON_TEXT[g.reason]}</span>
        {g.broken && <span className="pill broken">待修复</span>}
      </div>
      <div className="muted" style={{ margin: '2px 0 4px' }}>
        底本片段：{g.baseText ? <span className="cell-text">{g.baseText}</span> : '—'}
        {g.baseLineNo != null && ` 第${g.baseLineNo}行[${g.baseStartCp},${g.baseEndCp})`}
      </div>
      <table className="diff-cell-table">
        <tbody>
          {g.cells.map((c, i) => (
            <UnpairedCellRow key={i} c={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnpairedCellRow({ c }: { c: UnpairedCell }) {
  return (
    <tr>
      <td className="cell-msname">{c.msName}</td>
      <td className="cell-side" colSpan={2}>
        <CellText
          status={c.status}
          text={c.text}
          loc={locText(c.lineNo, c.startCp, c.endCp)}
          oobEnd={c.oobEnd}
        />
      </td>
    </tr>
  );
}
