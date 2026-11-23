/* Canvas Lite · 成绩计算
 * 输入 Canvas 的 assignment_groups（含 assignments 与 submission），算出：
 *   - 每个作业占课程总评的比例、已经拿到的分数
 *   - 当前得分（只按已评分作业算，和 Canvas 的 current score 口径一致）
 *   - 已锁定的分数、已扣掉的分数、还没评分的比例，以及达到目标分还需要多少
 *
 * 规则（与 Canvas 一致的部分）：
 *   - 课程开启「按分组加权」时，每组按 group_weight 计入；否则按分值合计
 *   - 免交（excused）、omit_from_final_grade、满分为 0 且没得分的作业不计入
 *   - 满分为 0 但有得分的作业算加分，只加分子
 *   - 分组的「去掉最低 / 最高 N 个」只作用于已评分作业
 *   - 权重合计不是 100 时，按参与计分的分组权重合计折算成 100
 * 纯函数，不依赖页面；挂在 window.CanvasGrades（Node 测试里是 globalThis.CanvasGrades）。
 */
(function (global) {
  'use strict';

  const round = (x) => Math.round(x * 1e6) / 1e6;

  function itemState(a) {
    const sub = a.submission || {};
    if (a.omit_from_final_grade) return 'excluded';
    if (sub.excused) return 'excused';
    if (sub.score != null && sub.workflow_state !== 'pending_review') return 'graded';
    return 'pending';
  }

  /** 按组规则丢掉已评分作业里最低 / 最高的几个 */
  function applyDrops(items, rules) {
    const graded = items.filter((x) => x.state === 'graded' && x.possible > 0);
    if (!rules || !graded.length) return;
    const never = new Set((rules.never_drop || []).map(String));
    const droppable = graded.filter((x) => !never.has(String(x.id)));
    const byPct = droppable.slice().sort((a, b) => a.score / a.possible - b.score / b.possible);
    const low = Math.max(0, Number(rules.drop_lowest) || 0);
    const high = Math.max(0, Number(rules.drop_highest) || 0);
    // 至少留一个已评分作业，否则整组没有分数
    const maxDrop = Math.max(0, graded.length - 1);
    let dropped = 0;
    for (const x of byPct.slice(0, low)) {
      if (dropped >= maxDrop) break;
      x.state = 'dropped';
      dropped += 1;
    }
    let droppedHigh = 0;
    for (const x of byPct.slice().reverse()) {
      if (droppedHigh >= high || dropped >= maxDrop) break;
      if (x.state === 'dropped') continue;
      x.state = 'dropped';
      dropped += 1;
      droppedHigh += 1;
    }
  }

  function computeCourseGrade(groups, options) {
    const weighted = !!(options && options.weighted);
    const list = (groups || []).map((g) => {
      const items = (g.assignments || []).map((a) => {
        const sub = a.submission || {};
        const possible = Number(a.points_possible) || 0;
        return {
          id: a.id,
          name: a.name || '未命名作业',
          possible,
          score: sub.score != null ? Number(sub.score) : null,
          state: itemState(a),
          dueAt: a.due_at || null,
          weight: 0,
          earned: 0,
          raw: a,
        };
      });
      items.forEach((x) => {
        if (x.state !== 'excluded' && x.state !== 'excused' && x.possible <= 0 && x.score == null) x.state = 'excluded';
      });
      applyDrops(items, g.rules);
      const counting = items.filter((x) => x.state === 'graded' || x.state === 'pending');
      const totalPossible = counting.reduce((s, x) => s + x.possible, 0);
      const graded = counting.filter((x) => x.state === 'graded');
      const gradedScore = graded.reduce((s, x) => s + x.score, 0);
      const gradedPossible = graded.reduce((s, x) => s + x.possible, 0);
      return {
        id: g.id,
        name: g.name || '未命名分组',
        rawWeight: Number(g.group_weight) || 0,
        rules: g.rules || null,
        items,
        totalPossible,
        gradedScore,
        gradedPossible,
        hasGraded: graded.length > 0 && gradedPossible > 0,
      };
    });

    // 分组占总评的比例（合计 100）
    if (weighted) {
      const active = list.filter((g) => g.totalPossible > 0 && g.rawWeight > 0);
      const sum = active.reduce((s, g) => s + g.rawWeight, 0);
      list.forEach((g) => { g.weight = sum > 0 && active.includes(g) ? (g.rawWeight / sum) * 100 : 0; });
    } else {
      const total = list.reduce((s, g) => s + g.totalPossible, 0);
      list.forEach((g) => { g.weight = total > 0 ? (g.totalPossible / total) * 100 : 0; });
    }

    // 每个作业的占比与已得分
    list.forEach((g) => {
      g.items.forEach((x) => {
        const counts = x.state === 'graded' || x.state === 'pending';
        x.weight = counts && g.totalPossible > 0 ? (g.weight * x.possible) / g.totalPossible : 0;
        x.pct = x.score != null && x.possible > 0 ? (x.score / x.possible) * 100 : null;
        // 加分题（满分 0）按所在组的分值折算
        if (x.state === 'graded') x.earned = g.totalPossible > 0 ? (g.weight * x.score) / g.totalPossible : 0;
      });
      g.earned = g.items.reduce((s, x) => s + x.earned, 0);
      g.gradedWeight = g.items.filter((x) => x.state === 'graded').reduce((s, x) => s + x.weight, 0);
      g.pct = g.hasGraded ? (g.gradedScore / g.gradedPossible) * 100 : null;
    });

    // 当前得分：只看已评分部分
    let current = null;
    if (weighted) {
      const scored = list.filter((g) => g.hasGraded && g.weight > 0);
      const w = scored.reduce((s, g) => s + g.weight, 0);
      if (w > 0) current = scored.reduce((s, g) => s + g.pct * g.weight, 0) / w;
    } else {
      const score = list.reduce((s, g) => s + g.gradedScore, 0);
      const possible = list.reduce((s, g) => s + g.gradedPossible, 0);
      if (possible > 0) current = (score / possible) * 100;
    }

    const earned = list.reduce((s, g) => s + g.earned, 0);
    const gradedWeight = list.reduce((s, g) => s + g.gradedWeight, 0);
    const totalWeight = list.reduce((s, g) => s + g.weight, 0);
    const remaining = Math.max(0, totalWeight - gradedWeight);

    return {
      weighted,
      groups: list,
      current: current == null ? null : round(current),
      earned: round(earned),
      gradedWeight: round(gradedWeight),
      lost: round(Math.max(0, gradedWeight - earned)),
      remaining: round(remaining),
      totalWeight: round(totalWeight),
      /** 剩余部分平均要拿多少 % 才能让总评达到 target；不需要再拿分返回 0，做不到返回 Infinity */
      needed(target) {
        const gap = target - earned;
        if (gap <= 0) return 0;
        if (remaining <= 1e-9) return Infinity;
        return round((gap / remaining) * 100);
      },
    };
  }

  global.CanvasGrades = { computeCourseGrade };
})(typeof window !== 'undefined' ? window : globalThis);
