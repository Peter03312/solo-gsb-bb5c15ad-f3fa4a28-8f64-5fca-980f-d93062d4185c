"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.charDiff = charDiff;
exports.buildEditionDiff = buildEditionDiff;
/**
 * 码点级 LCS 行对照；超长行（乘积超阈值）退化为整段替换，
 * 位置一律按 Unicode 码点计，生僻字安全。
 */
function charDiff(oldStr, newStr) {
    const a = Array.from(oldStr);
    const b = Array.from(newStr);
    const n = a.length;
    const m = b.length;
    const out = [];
    if (n === 0 && m === 0)
        return [];
    if (n === 0)
        return [{ op: 'ins', text: b.join('') }];
    if (m === 0)
        return [{ op: 'del', text: a.join('') }];
    if (n * m > 2_500_000) {
        out.push({ op: 'del', text: a.join('') });
        out.push({ op: 'ins', text: b.join('') });
        return out;
    }
    const w = m + 1;
    const dp = new Int32Array((n + 1) * w);
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            dp[i * w + j] =
                a[i - 1] === b[j - 1]
                    ? dp[(i - 1) * w + (j - 1)] + 1
                    : Math.max(dp[(i - 1) * w + j], dp[i * w + (j - 1)]);
        }
    }
    const rev = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            rev.push({ op: 'eq', text: a[i - 1] });
            i--;
            j--;
        }
        else if (j > 0 && (i === 0 || dp[i * w + (j - 1)] >= dp[(i - 1) * w + j])) {
            rev.push({ op: 'ins', text: b[j - 1] });
            j--;
        }
        else {
            rev.push({ op: 'del', text: a[i - 1] });
            i--;
        }
    }
    rev.reverse();
    return mergeAdjacent(rev);
}
function mergeAdjacent(ops) {
    const r = [];
    for (const o of ops) {
        const last = r[r.length - 1];
        if (last && last.op === o.op)
            last.text += o.text;
        else
            r.push({ ...o });
    }
    return r;
}
function statusOf(cell) {
    if (!cell)
        return 'absent';
    if (cell.missing)
        return 'missing';
    if (cell.broken)
        return 'broken';
    if (cell.text === undefined)
        return 'absent';
    return 'text';
}
function describe(cell) {
    const status = statusOf(cell);
    if (!cell || status === 'absent' || status === 'missing')
        return { status };
    return {
        status,
        text: cell.text,
        lineNo: cell.lineNo,
        startCp: cell.startCp,
        endCp: cell.endCp,
        oobEnd: cell.oobEnd,
    };
}
/** 底本片段位置键；待修复 / 缺文 / 无有效行号时为 null（不参与配对）。 */
function baseKey(g, baseMsId) {
    if (baseMsId == null)
        return null;
    const cell = g.cells.find((c) => c.msId === baseMsId);
    if (!cell || cell.missing || cell.broken)
        return null;
    if (cell.lineNo == null || cell.startCp == null || cell.endCp == null)
        return null;
    return `${cell.lineNo}:${cell.startCp}:${cell.endCp}`;
}
function flattenLines(view) {
    const map = new Map();
    for (const rb of view.rawByMs) {
        for (const l of rb.lines)
            map.set(l.lineId, { msId: rb.msId, lineId: l.lineId, lineNo: l.lineNo, content: l.content });
    }
    return map;
}
function buildEditionDiff(oldView, newView, meta) {
    const oldBase = oldView.document.baseMsId;
    const newBase = newView.document.baseMsId;
    const baseChanged = oldBase !== newBase;
    const oldMs = new Map(oldView.manuscripts.map((m) => [m.id, m]));
    const newMs = new Map(newView.manuscripts.map((m) => [m.id, m]));
    const msIds = [];
    for (const m of oldView.manuscripts)
        if (!msIds.includes(m.id))
            msIds.push(m.id);
    for (const m of newView.manuscripts)
        if (!msIds.includes(m.id))
            msIds.push(m.id);
    const msPos = new Map(msIds.map((id, i) => [id, i]));
    const msName = (id) => newMs.get(id)?.name ?? oldMs.get(id)?.name ?? `抄本#${id}`;
    const manuscripts = msIds.map((id) => {
        const o = oldMs.get(id);
        const n = newMs.get(id);
        let kind;
        if (o && n)
            kind = o.name === n.name ? 'same' : 'renamed';
        else if (n)
            kind = 'added';
        else
            kind = 'removed';
        return { msId: id, oldName: o?.name ?? null, newName: n?.name ?? null, kind };
    });
    // ---------- 组配对 ----------
    const pairedGroups = [];
    const unpairedOldGroups = [];
    const unpairedNewGroups = [];
    const describeUnpaired = (g, view) => view.manuscripts.flatMap((m) => {
        const d = describe(g.cells.find((c) => c.msId === m.id));
        if (d.status === 'absent')
            return [];
        return [{ msId: m.id, msName: m.name, ...d }];
    });
    const pushUnpaired = (g, view, side, reason) => {
        const baseId = side === 'old' ? oldBase : newBase;
        const bc = baseId == null ? undefined : g.cells.find((c) => c.msId === baseId);
        const u = {
            kind: 'unpaired',
            side,
            ord: g.ord,
            groupId: g.id,
            broken: g.broken,
            reason,
            baseText: g.baseText,
            cells: describeUnpaired(g, view),
        };
        if (bc && !bc.missing && bc.lineNo != null && bc.startCp != null && bc.endCp != null) {
            u.baseLineNo = bc.lineNo;
            u.baseStartCp = bc.startCp;
            u.baseEndCp = bc.endCp;
        }
        (side === 'old' ? unpairedOldGroups : unpairedNewGroups).push(u);
    };
    const pairCells = (og, ng) => msIds.map((msId) => {
        const od = describe(og.cells.find((c) => c.msId === msId));
        const nd = describe(ng.cells.find((c) => c.msId === msId));
        let charChanges = null;
        if (od.status === 'text' && nd.status === 'text' && od.text !== nd.text) {
            charChanges = charDiff(od.text ?? '', nd.text ?? '');
        }
        const changed = od.status !== nd.status ||
            od.text !== nd.text ||
            od.lineNo !== nd.lineNo ||
            od.startCp !== nd.startCp ||
            od.endCp !== nd.endCp ||
            charChanges != null;
        return {
            msId,
            msName: msName(msId),
            oldStatus: od.status,
            newStatus: nd.status,
            changed,
            oldText: od.text,
            newText: nd.text,
            oldLineNo: od.lineNo,
            newLineNo: nd.lineNo,
            oldStartCp: od.startCp,
            oldEndCp: od.endCp,
            newStartCp: nd.startCp,
            newEndCp: nd.endCp,
            newOobEnd: nd.oobEnd,
            charChanges,
        };
    });
    if (baseChanged || oldBase == null || newBase == null) {
        // 底本不同（或缺底本）：分别列出，绝不按 ID / 序 / 文字猜测配对。
        for (const g of oldView.groups)
            pushUnpaired(g, oldView, 'old', 'base-mismatch');
        for (const g of newView.groups)
            pushUnpaired(g, newView, 'new', 'base-mismatch');
    }
    else {
        const bucket = (view) => {
            const byKey = new Map();
            const keyless = [];
            for (const g of view.groups) {
                const k = baseKey(g, newBase);
                if (k == null)
                    keyless.push(g);
                else {
                    const arr = byKey.get(k) ?? [];
                    arr.push(g);
                    byKey.set(k, arr);
                }
            }
            return { byKey, keyless };
        };
        const ob = bucket(oldView);
        const nb = bucket(newView);
        const pairedOld = new Set();
        const pairedNew = new Set();
        for (const [k, ogs] of ob.byKey) {
            const ngs = nb.byKey.get(k) ?? [];
            if (ogs.length === 1 && ngs.length === 1) {
                const og = ogs[0];
                const ng = ngs[0];
                pairedOld.add(og.id);
                pairedNew.add(ng.id);
                const cells = pairCells(og, ng);
                const ordChanged = og.ord !== ng.ord;
                pairedGroups.push({
                    kind: 'paired',
                    oldOrd: og.ord,
                    newOrd: ng.ord,
                    ordChanged,
                    changed: ordChanged || og.broken !== ng.broken || cells.some((c) => c.changed),
                    oldBroken: og.broken,
                    newBroken: ng.broken,
                    oldBaseText: og.baseText,
                    newBaseText: ng.baseText,
                    cells,
                });
            }
        }
        pairedGroups.sort((a, b) => a.oldOrd - b.oldOrd);
        for (const g of oldView.groups) {
            if (pairedOld.has(g.id))
                continue;
            if (ob.keyless.includes(g))
                pushUnpaired(g, oldView, 'old', 'broken-base');
            else if ((ob.byKey.get(baseKey(g, newBase)) ?? []).length > 1) {
                pushUnpaired(g, oldView, 'old', 'duplicate-key');
            }
            else
                pushUnpaired(g, oldView, 'old', 'unmatched');
        }
        for (const g of newView.groups) {
            if (pairedNew.has(g.id))
                continue;
            if (nb.keyless.includes(g))
                pushUnpaired(g, newView, 'new', 'broken-base');
            else if ((nb.byKey.get(baseKey(g, newBase)) ?? []).length > 1) {
                pushUnpaired(g, newView, 'new', 'duplicate-key');
            }
            else
                pushUnpaired(g, newView, 'new', 'unmatched');
        }
    }
    // ---------- 行文增删改（按抄本原始行号；行 ID 稳定） ----------
    const oldLines = flattenLines(oldView);
    const newLines = flattenLines(newView);
    const lineIds = new Set([...oldLines.keys(), ...newLines.keys()]);
    const lineChanges = [];
    for (const lineId of lineIds) {
        const o = oldLines.get(lineId);
        const n = newLines.get(lineId);
        const msId = n?.msId ?? o.msId;
        if (o && n) {
            if (o.content === n.content)
                continue;
            lineChanges.push({ msId, msName: msName(msId), lineNo: n.lineNo, kind: 'modified', changes: charDiff(o.content, n.content) });
        }
        else if (n) {
            lineChanges.push({
                msId, msName: msName(msId), lineNo: n.lineNo, kind: 'added',
                changes: n.content ? [{ op: 'ins', text: n.content }] : [],
            });
        }
        else if (o) {
            lineChanges.push({
                msId, msName: msName(msId), lineNo: o.lineNo, kind: 'removed',
                changes: o.content ? [{ op: 'del', text: o.content }] : [],
            });
        }
    }
    lineChanges.sort((a, b) => (msPos.get(a.msId) - msPos.get(b.msId)) || a.lineNo - b.lineNo);
    unpairedOldGroups.sort((a, b) => a.ord - b.ord);
    unpairedNewGroups.sort((a, b) => a.ord - b.ord);
    return {
        documentId: newView.document.id,
        title: newView.document.title,
        baseChanged,
        oldSide: {
            editionNo: meta.editionNo,
            createdAt: meta.createdAt instanceof Date ? meta.createdAt.toISOString() : (meta.createdAt ?? null),
            version: oldView.document.version,
            baseMsId: oldBase,
            baseMsName: oldBase == null ? null : (oldMs.get(oldBase)?.name ?? null),
        },
        newSide: {
            version: newView.document.version,
            baseMsId: newBase,
            baseMsName: newBase == null ? null : (newMs.get(newBase)?.name ?? null),
        },
        manuscripts,
        lineChanges,
        pairedGroups,
        unpairedOldGroups,
        unpairedNewGroups,
        stats: {
            pairedCount: pairedGroups.length,
            pairedChangedCount: pairedGroups.filter((g) => g.changed).length,
            unpairedOldCount: unpairedOldGroups.length,
            unpairedNewCount: unpairedNewGroups.length,
            linesModified: lineChanges.filter((l) => l.kind === 'modified').length,
            linesAdded: lineChanges.filter((l) => l.kind === 'added').length,
            linesRemoved: lineChanges.filter((l) => l.kind === 'removed').length,
        },
    };
}
