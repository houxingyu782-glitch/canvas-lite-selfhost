# Canvas Lite

开始工作前先读 `维护说明.md`：工作约定、测试、部署、代码地图、踩过的坑、版本记录都在里面。

最重要的几条：

- 只读：不提交作业、不发消息；代理只放行 GET / HEAD
- 令牌不能写进代码、日志、提交、截图；测试用 `CANVAS_TOKEN` 环境变量
- 改 `public/` 要同时改三处版本号：`public/js/app.js`、`public/sw.js`、`package.json`
- 改功能要同步改 `test/e2e.mjs`、`test/mock-canvas.mjs` 和文档（`README.md`、`使用说明.md`、`维护说明.md`）
- `npm test` 全过才能合并、部署；推送到 GitHub 不会自动上线，部署要单独执行
- 仓库里不要写任何人的线上网址、Cloudflare 项目名或个人信息；这些放在使用者自己的私人笔记里
- 用中文沟通，文档也用中文
