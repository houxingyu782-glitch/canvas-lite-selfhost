/**
 * 测试用的假 Canvas 服务器（只实现本项目会用到的接口）
 * 用法：node test/mock-canvas.mjs 9911
 */
import http from 'node:http';

const PORT = Number(process.argv[2] || 9911);
const TOKEN = 'test-token-0123456789abcdef';

const now = Date.now();
const iso = (days, hour = 23, minute = 59) => {
  const d = new Date(now + days * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const term = { id: 7, name: '2026 Fall' };

const courses = [
  {
    id: 101,
    name: 'CS 101: Introduction to Programming',
    course_code: 'CS 101',
    term,
    is_favorite: true,
    apply_assignment_group_weights: true,
    teachers: [{ id: 1, display_name: 'Dr. Ada Lovelace' }],
    enrollments: [{ type: 'student', role: 'StudentEnrollment', computed_current_score: 87.5, computed_current_grade: 'A-' }],
  },
  {
    id: 102,
    name: 'MATH 201: Linear Algebra',
    course_code: 'MATH 201',
    term,
    is_favorite: false,
    teachers: [{ id: 2, display_name: 'Prof. Emmy Noether' }],
    enrollments: [{ type: 'student', role: 'StudentEnrollment', computed_current_score: 74.2, computed_current_grade: 'B' }],
  },
  {
    id: 103,
    name: 'PHIL 110: Ethics of Technology and Society',
    course_code: 'PHIL 110',
    term,
    is_favorite: false,
    teachers: [{ id: 3, display_name: 'Dr. Hannah Arendt' }],
    enrollments: [{ type: 'student', role: 'StudentEnrollment', computed_current_score: null, computed_current_grade: null }],
  },
  {
    id: 104,
    name: 'PHYS 121: Mechanics',
    course_code: 'PHYS 121',
    term,
    is_favorite: false,
    enrollments: [{ type: 'student', role: 'StudentEnrollment', computed_current_score: 91.1, computed_current_grade: 'A' }],
  },
];

const submission = (overrides = {}) => ({
  id: 9000,
  workflow_state: 'unsubmitted',
  submitted_at: null,
  score: null,
  grade: null,
  late: false,
  missing: false,
  excused: false,
  ...overrides,
});

const assignments101 = [
  {
    id: 5001,
    course_id: 101,
    name: 'Problem Set 4: Recursion',
    description: '<p>完成课本第 7 章的练习，并解释 <strong>递归</strong> 与迭代的取舍。</p><ul><li>附上你的测试用例</li><li>用大 O 标注复杂度</li></ul><p>参考：<a href="https://example.com/notes">课程讲义</a></p>',
    due_at: iso(2),
    points_possible: 100,
    submission_types: ['online_upload'],
    html_url: '/courses/101/assignments/5001',
    attachments: [{ id: 1, filename: 'ps4-starter.zip', url: 'https://example.com/files/ps4.zip', content_type: 'application/zip' }],
    submission: submission({ id: 9001 }),
  },
  {
    id: 5002,
    course_id: 101,
    name: 'Lab 3 Report',
    description: '<p>把实验过程写成 2 页报告。</p>',
    due_at: iso(-1),
    points_possible: 50,
    submission_types: ['online_upload'],
    html_url: '/courses/101/assignments/5002',
    submission: submission({ id: 9002, workflow_state: 'graded', submitted_at: iso(-2, 18), score: 42, grade: '42' }),
  },
  {
    id: 5003,
    course_id: 101,
    name: 'Reading Response: Clean Code',
    description: '<p>读第 2、3 章，写 300 字感受。</p><script>alert("xss")</script><p onclick="alert(1)">这段文字带危险属性，应该被清理。</p>',
    due_at: iso(5, 12),
    points_possible: 20,
    submission_types: ['online_text_entry'],
    html_url: '/courses/101/assignments/5003',
    rubric: [
      {
        id: 'r1',
        description: '核心观点提炼',
        points: 10,
        ratings: [
          { id: 'r1_full', description: '准确深刻', points: 10 },
          { id: 'r1_mid', description: '基本到位', points: 8 },
        ],
      },
      {
        id: 'r2',
        description: '例子与表达',
        points: 10,
        ratings: [
          { id: 'r2_full', description: '清晰流畅', points: 10 },
        ],
      },
    ],
    submission: submission({
      id: 9003,
      workflow_state: 'graded',
      submitted_at: iso(-6, 9),
      score: 18,
      grade: '90%',
      submission_comments: [
        {
          id: 8101,
          author_name: 'TA Grace',
          comment: '结合第 3 章函数短小原则举的例子很好。<img src=x onerror=alert(1)>',
          created_at: iso(-5, 14, 20),
        },
      ],
      rubric_assessment: {
        r1: { points: 8, rating_id: 'r1_mid', comments: '可以再展开对比一下命名规范' },
        r2: { points: 10, rating_id: 'r2_full', comments: '' },
      },
    }),
  },
  {
    id: 5004,
    course_id: 101,
    name: 'Final Project Proposal',
    description: '<h3>要求</h3><p>一页 PDF，包含题目、动机、计划。</p><table><tr><th>部分</th><th>占比</th></tr><tr><td>题目</td><td>30%</td></tr></table>',
    due_at: null,
    points_possible: 100,
    submission_types: ['online_upload'],
    html_url: '/courses/101/assignments/5004',
    submission: submission({ id: 9004, missing: true }),
  },
  {
    id: 5005,
    course_id: 101,
    name: 'Quiz 2: Big-O',
    description: '<p>10 道选择题。</p>',
    due_at: iso(9, 10),
    points_possible: 10,
    submission_types: ['online_quiz'],
    html_url: '/courses/101/assignments/5005',
    submission: submission({ id: 9005 }),
  },
];

const announcements101 = [
  {
    id: 7001,
    course_id: 101,
    title: '周四的课改到线上',
    message: '<p>这周四的课改为 Zoom，链接在模块里。记得提前看录播。</p>',
    posted_at: iso(-1, 9),
    author: { display_name: 'Dr. Ada Lovelace' },
    html_url: '/courses/101/discussion_topics/7001',
  },
  {
    id: 7002,
    course_id: 101,
    title: '期中项目分组',
    message: '<p>请在周五前把分组名单发到讨论区。每组 3–4 人。</p><p>没有组队的同学会被随机分配。</p>',
    posted_at: iso(-4, 15),
    author: { display_name: 'TA Grace' },
    html_url: '/courses/101/discussion_topics/7002',
  },
];

// 课程 101 按分组加权：作业 40% / 阅读与测验 20%（去掉最低 1 次）/ 期末项目 40%
const byId = (id) => assignments101.find((a) => a.id === id);
const groups101 = [
  { id: 801, name: 'Problem Sets', position: 1, group_weight: 40, rules: {}, assignments: [byId(5001), byId(5002)] },
  { id: 802, name: '阅读与测验', position: 2, group_weight: 20, rules: { drop_lowest: 1 }, assignments: [byId(5003), byId(5005)] },
  { id: 803, name: '期末项目', position: 3, group_weight: 40, rules: {}, assignments: [byId(5004)] },
];

const announcements102 = [
  {
    id: 7101,
    course_id: 102,
    title: 'Homework 8 截止时间提醒',
    message: '<p>Homework 8 明早截止，请注意第 3 题的矩阵维度。</p>',
    posted_at: iso(-2, 20),
    author: { display_name: 'Prof. Emmy Noether' },
    html_url: '/courses/102/discussion_topics/7101',
    read_state: 'read',
  },
];

const announcementsByCourse = { 101: announcements101, 102: announcements102 };

const modules101 = [
  {
    id: 301,
    name: 'Week 10 · Recursion',
    items: [
      { id: 1, title: '讲义 PDF', type: 'File', html_url: 'https://example.com/files/lecture10.pdf' },
      { id: 2, title: 'Problem Set 4: Recursion', type: 'Assignment', content_id: 5001, html_url: 'https://example.com/courses/101/assignments/5001' },
      { id: 3, title: '补充阅读：递归与栈', type: 'Page', page_url: 'recursion', url: '/api/v1/courses/101/pages/recursion', html_url: 'https://example.com/courses/101/pages/recursion' },
    ],
  },
  {
    id: 302,
    name: 'Week 11 · 复杂度分析',
    items: [
      { id: 4, title: '录播（YouTube）', type: 'ExternalUrl', html_url: 'https://example.com/video' },
      { id: 5, title: 'Quiz 2: Big-O', type: 'Quiz', html_url: 'https://example.com/courses/101/quizzes/12' },
      { id: 6, title: '外部链接页面', type: 'ExternalUrl', external_url: 'http://127.0.0.1:9911/courses/101/pages/recursion', html_url: 'http://127.0.0.1:9911/courses/101/pages/recursion' },
    ],
  },
];

const plannerItems = [
  {
    plannable_type: 'assignment',
    plannable_id: 5001,
    course_id: 101,
    context_name: 'CS 101',
    plannable_date: iso(2),
    plannable: { id: 5001, title: 'Problem Set 4: Recursion', due_at: iso(2), points_possible: 100, submission_types: ['online_upload'] },
    html_url: '/courses/101/assignments/5001',
    submissions: { workflow_state: 'unsubmitted' },
  },
  {
    plannable_type: 'assignment',
    plannable_id: 6001,
    course_id: 102,
    context_name: 'MATH 201',
    plannable_date: iso(1, 9),
    plannable: { id: 6001, title: 'Homework 8', due_at: iso(1, 9), points_possible: 40 },
    html_url: '/courses/102/assignments/6001',
    submissions: { workflow_state: 'submitted' },
  },
  {
    plannable_type: 'quiz',
    plannable_id: 6002,
    course_id: 103,
    context_name: 'PHIL 110',
    plannable_date: iso(4, 14),
    plannable: { id: 6002, title: 'Reading Quiz: AI Ethics', due_at: iso(4, 14), points_possible: 15 },
    html_url: '/courses/103/quizzes/6002',
  },
  {
    plannable_type: 'calendar_event',
    plannable_id: 6003,
    course_id: 104,
    context_name: 'PHYS 121',
    plannable_date: iso(6, 10),
    plannable: { id: 6003, title: 'Lab Session', start_at: iso(6, 10) },
    html_url: '/calendar?event_id=6003',
  },
];

const todo = [
  {
    type: 'submitting',
    course_id: 101,
    context_name: 'CS 101',
    assignment: { id: 5001, name: 'Problem Set 4: Recursion', due_at: iso(2), points_possible: 100, course_id: 101 },
    html_url: '/courses/101/assignments/5001',
  },
  {
    type: 'submitting',
    course_id: 103,
    context_name: 'PHIL 110',
    assignment: { id: 7001, name: 'Response Paper 2', due_at: iso(3, 18), points_possible: 30, course_id: 103 },
    html_url: '/courses/103/assignments/7001',
  },
  {
    type: 'grading',
    course_id: 102,
    context_name: 'MATH 201',
    assignment: { id: 6001, name: 'Homework 8', due_at: iso(1, 9), points_possible: 40, course_id: 102 },
    html_url: '/courses/102/assignments/6001',
  },
];

function pageSlice(list, url) {
  const page = Number(url.searchParams.get('page') || 1);
  const perPage = Math.min(Number(url.searchParams.get('per_page') || 100), 2);
  const start = (page - 1) * perPage;
  return {
    items: list.slice(start, start + perPage),
    next: start + perPage < list.length ? page + 1 : null,
    perPage,
  };
}

function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'x-rate-limit-remaining': '698.0',
    ...headers,
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === '/healthz') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    json(res, 401, { errors: [{ message: 'Invalid access token.' }] });
    return;
  }

  // 分页测试：故意每页 2 条
  if (path === '/api/v1/courses') {
    json(res, 200, courses);
    return;
  }

  if (path === '/api/v1/users/self/profile') {
    const profile = {
      id: 42,
      name: 'Alex Chen',
      short_name: 'Alex',
      login_id: 'alex.chen@example.edu',
      email: 'alex.chen@example.edu',
      avatar_url: null,
      // 只有本人访问自己的 profile 才带这个字段
      calendar: { ics: 'https://canvas.example.edu/feeds/calendars/user_demo1234.ics' },
    };
    if (process.env.MOCK_NO_CALENDAR === '1') delete profile.calendar;
    json(res, 200, profile);
    return;
  }

  if (path === '/api/v1/users/self/todo') {
    json(res, 200, todo);
    return;
  }

  if (path === '/api/v1/planner/items') {
    if (process.env.MOCK_NO_PLANNER === '1') {
      json(res, 403, { errors: [{ message: 'Planner is disabled for this account' }] });
      return;
    }
    json(res, 200, plannerItems);
    return;
  }

  let m = path.match(/^\/api\/v1\/courses\/(\d+)\/assignments$/);
  if (m) {
    const list = m[1] === '101' ? assignments101 : [];
    const { items, next, perPage } = pageSlice(list, url);
    const headers = {};
    if (next) {
      headers.link = `<http://127.0.0.1:${PORT}${path}?page=${next}&per_page=${perPage}>; rel="next", <http://127.0.0.1:${PORT}${path}?page=1&per_page=${perPage}>; rel="current"`;
    }
    json(res, 200, items, headers);
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/assignment_groups$/);
  if (m) {
    json(res, 200, m[1] === '101' ? groups101 : []);
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)$/);
  if (m) {
    const found = assignments101.find((a) => String(a.id) === m[2]);
    if (!found) {
      json(res, 404, { errors: [{ message: 'not found' }] });
      return;
    }
    const includes = new Set(url.searchParams.getAll('include[]'));
    const copy = { ...found, submission: found.submission ? { ...found.submission } : undefined };
    if (copy.submission) {
      if (!includes.has('submission_comments')) delete copy.submission.submission_comments;
      if (!includes.has('rubric_assessment')) delete copy.submission.rubric_assessment;
    }
    json(res, 200, copy);
    return;
  }

  if (path === '/api/v1/announcements') {
    const codes = url.searchParams.getAll('context_codes[]');
    const list = codes.flatMap((code) => (announcementsByCourse[code.replace('course_', '')] || [])
      .map((a) => ({ ...a, context_code: code })));
    json(res, 200, list);
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/discussion_topics$/);
  if (m) {
    json(res, 200, announcementsByCourse[m[1]] || []);
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/discussion_topics\/(\d+)$/);
  if (m) {
    const found = (announcementsByCourse[m[1]] || []).find((a) => String(a.id) === m[2]);
    if (found) json(res, 200, found);
    else json(res, 404, { errors: [{ message: 'not found' }] });
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/front_page$/);
  if (m) {
    if (m[1] === '101') {
      json(res, 200, {
        title: '课程主页',
        url: 'homepage',
        updated_at: iso(-1),
        body: '<h3>课程主页</h3><p>这里放课程说明和教程题目。</p><p><a href="http://127.0.0.1:9911/courses/101/modules/301">Week 10 · Recursion</a></p><p><a href="http://127.0.0.1:9911/courses/101/pages/recursion">补充阅读</a></p>',
      });
    } else {
      json(res, 404, { errors: [{ message: 'no front page' }] });
    }
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/pages\/([^/]+)$/);
  if (m) {
    if (m[1] === '101' && m[2] === 'linked-page') {
      json(res, 200, { title: '相关页面', url: 'linked-page', updated_at: iso(-1), html_url: 'https://example.com/courses/101/pages/linked-page', body: '<p>这是被链接的页面，说明站内跳转成功。</p>' });
    } else if (m[1] === '101' && m[2] === 'recursion') {
      json(res, 200, {
        title: '补充阅读：递归与栈',
        url: 'recursion',
        updated_at: iso(-2, 10),
        html_url: 'https://example.com/courses/101/pages/recursion',
        body: '<h3>为什么用栈</h3><p>递归本质上是函数调用栈的展开。</p><p><img src="/images/stack.png" alt="栈示意"></p><p><a href="http://127.0.0.1:9911/courses/101/pages/linked-page">相关页面</a></p>',
      });
    } else {
      json(res, 404, { errors: [{ message: 'page not found' }] });
    }
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/modules$/);
  if (m) {
    json(res, 200, m[1] === '101' ? modules101 : []);
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/tabs$/);
  if (m) {
    const id = m[1];
    const base = [
      { id: 'home', label: 'Home', type: 'internal', html_url: `/courses/${id}` },
      { id: 'modules', label: 'Modules', type: 'internal', html_url: `/courses/${id}/modules` },
    ];
    // 101 有 Ed Discussion；102 只有别的外部工具和一个被隐藏的 Ed，不应显示入口
    const extra = id === '101'
      ? [{ id: 'context_external_tool_501', label: 'Ed Discussion', type: 'external', html_url: `/courses/${id}/external_tools/501` }]
      : id === '102'
        ? [
          { id: 'context_external_tool_601', label: 'Echo360', type: 'external', html_url: `/courses/${id}/external_tools/601` },
          { id: 'context_external_tool_602', label: 'Ed Discussion', type: 'external', hidden: true, html_url: `/courses/${id}/external_tools/602` },
        ]
        : [];
    json(res, 200, [...base, ...extra]);
    return;
  }

  m = path.match(/^\/api\/v1\/courses\/(\d+)\/enrollments$/);
  if (m) {
    json(res, 200, []);
    return;
  }

  json(res, 404, { errors: [{ message: `mock 未实现：${path}` }] });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock canvas on http://127.0.0.1:${PORT} (token: ${TOKEN})`);
});
