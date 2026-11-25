import assert from 'node:assert/strict';
import test from 'node:test';
import '../public/js/grades.js';

const { computeCourseGrade } = globalThis.CanvasGrades;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-3, `${label}: ${actual} ≠ ${expected}`);
const a = (id, possible, score, extra = {}) => ({
  id, name: `A${id}`, points_possible: possible,
  submission: score == null ? { workflow_state: 'unsubmitted', score: null } : { workflow_state: 'graded', score },
  ...extra,
});

// 作业组 40%：8/10 已评分 + 一个未评分的 10 分；考试组 60%：90/100
const sample = [
  { id: 1, name: '作业', group_weight: 40, assignments: [a(11, 10, 8), a(12, 10, null)] },
  { id: 2, name: '考试', group_weight: 60, assignments: [a(21, 100, 90)] },
];

test('weighted: per-assignment share, earned points and current score', () => {
  const r = computeCourseGrade(sample, { weighted: true });
  const [hw, exam] = r.groups;
  near(hw.weight, 40, '作业组占比');
  near(hw.items[0].weight, 20, '作业 1 占比');
  near(hw.items[0].earned, 16, '作业 1 已得');
  near(hw.items[1].weight, 20, '未评分作业占比');
  near(exam.items[0].earned, 54, '考试已得');
  near(r.current, 86, '当前得分 = (80%×40 + 90%×60) / 100');
  near(r.earned, 70, '已锁定');
  near(r.gradedWeight, 80, '已评分占比');
  near(r.lost, 10, '已扣分');
  near(r.remaining, 20, '剩余占比');
  near(r.needed(85), 75, '要到 85 剩余平均需要 75%');
  assert.equal(r.needed(60), 0, '已经达到的目标返回 0');
  assert.ok(r.needed(95) > 100, '做不到的目标超过 100%');
});

test('unweighted: shares follow points possible', () => {
  const r = computeCourseGrade(sample, { weighted: false });
  near(r.groups[0].items[0].weight, (10 / 120) * 100, '作业 1 占比按分值');
  near(r.groups[1].items[0].earned, 75, '考试已得 90/120');
  near(r.current, (98 / 110) * 100, '当前得分 = 已得分 / 已评分满分');
  near(r.remaining, (10 / 120) * 100, '剩余占比');
});

test('group weights that do not add up to 100 are scaled', () => {
  const scaled = sample.map((g) => ({ ...g, group_weight: g.group_weight / 2 }));
  const r = computeCourseGrade(scaled, { weighted: true });
  near(r.groups[0].weight, 40, '20 / 50 → 40%');
  near(r.current, 86, '当前得分不变');
  near(r.totalWeight, 100, '合计 100');
});

test('empty weighted groups do not take a share', () => {
  const r = computeCourseGrade([...sample, { id: 3, name: '空分组', group_weight: 50, assignments: [] }], { weighted: true });
  near(r.groups[2].weight, 0, '空分组 0%');
  near(r.groups[0].weight, 40, '其他分组不受影响');
});

test('excused, omitted and zero-point items do not count; extra credit adds to the score', () => {
  const r = computeCourseGrade([{
    id: 1, name: '作业', group_weight: 100, assignments: [
      a(1, 10, 6),
      { ...a(2, 10, null), submission: { excused: true } },
      a(3, 10, 0, { omit_from_final_grade: true }),
      a(4, 0, null),
      a(5, 0, 2),
      a(6, 0, 0),
    ],
  }], { weighted: true });
  const states = r.groups[0].items.map((x) => x.state);
  assert.deepEqual(states, ['graded', 'excused', 'excluded', 'excluded', 'graded', 'excluded']);
  near(r.current, 80, '(6 + 2 加分) / 10');
  near(r.earned, 80, '已锁定 80');
  near(r.remaining, 0, '没有剩余');
  assert.equal(r.needed(90), Infinity, '没有剩余时达不到更高目标');
});

test('drop_lowest / drop_highest / never_drop apply to graded work only', () => {
  const group = (rules) => [{ id: 1, name: '小测', group_weight: 100, rules, assignments: [a(1, 10, 5), a(2, 10, 8), a(3, 10, 9), a(4, 10, null)] }];
  let r = computeCourseGrade(group({ drop_lowest: 1 }), { weighted: true });
  assert.deepEqual(r.groups[0].items.map((x) => x.state), ['dropped', 'graded', 'graded', 'pending']);
  near(r.current, 85, '去掉 5/10 后 17/20');
  near(r.groups[0].items[3].weight, 100 / 3, '剩下 3 个作业平分');

  r = computeCourseGrade(group({ drop_lowest: 1, never_drop: [1] }), { weighted: true });
  assert.equal(r.groups[0].items[1].state, 'dropped', 'never_drop 的作业保留，改丢下一个最低');

  r = computeCourseGrade(group({ drop_highest: 1 }), { weighted: true });
  assert.equal(r.groups[0].items[2].state, 'dropped', '去掉最高的 9/10');

  r = computeCourseGrade(group({ drop_lowest: 5 }), { weighted: true });
  assert.equal(r.groups[0].items.filter((x) => x.state === 'graded').length, 1, '至少保留一个已评分作业');
});

test('nothing graded yet', () => {
  const r = computeCourseGrade([{ id: 1, name: 'A', group_weight: 100, assignments: [a(1, 10, null)] }], { weighted: true });
  assert.equal(r.current, null);
  near(r.earned, 0, '已锁定 0');
  near(r.remaining, 100, '全部未评分');
  near(r.needed(50), 50, '剩余平均 50% 即可');
});
