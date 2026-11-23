# Canvas Lite 自托管版

用自己的 Canvas 个人访问令牌查看今天要交的作业，以及各门课的作业、公告、课件和成绩。不用反复过学校的 SSO 验证，手机和电脑都有专门的布局，可以添加到手机主屏幕当 App 用。

可以在本机运行，也可以部署到你自己的 Cloudflare Pages（免费额度够用）。适用于任何开放了个人访问令牌的 Canvas 学校。

Canvas Lite **只读**：提交作业、测验、讨论回复等操作仍在学校 Canvas 完成。

## 功能

- **今天**：逾期 / 今天截止 / 7 天内 / 未读公告四个数字，未来 7 天日期条，按天分组的作业和日程时间线，可隐藏已完成
- **课程**：每门课的当前成绩和下一项作业；课程详情有概览、作业、公告、模块（文件站内直接下载）、成绩五个栏目
- **成绩构成**：按作业分组权重算出每项占总评多少、已经拿到多少、当前得分，以及总评要达到 50 / 65 / 75 / 85 分剩下的作业平均要拿多少
- **成绩**：所有课程的 Canvas 官方成绩和构成估算，官方成绩缺失时用估算补位
- **公告**：所有课程最近 45 天的公告汇总，按课程筛选，未读标记
- **搜索**：<kbd>/</kbd> 或 <kbd>Ctrl/⌘ K</kbd>，搜课程、作业、公告和模块里的资料
- **布局**：手机底部四个标签，详情全屏；电脑左侧栏，宽屏时详情停靠在右侧
- 浅色 / 深色模式；PWA，数据先显示本地缓存再后台刷新

## 为什么需要代理

Canvas API 不返回跨域响应头，浏览器不能直接请求它。所以本项目自带一个同源代理，把网页发出的 `/api/v1/...` 请求带上你的令牌转发给学校 Canvas：

| 运行方式 | 代理 |
| --- | --- |
| 本机 | `server/server.mjs`（零依赖 Node，同时托管网页） |
| Cloudflare Pages | `public/_worker.js`（随网页一起上传） |

两种方式都不需要另外搭服务器，也不需要数据库。

## 在本机运行

需要 Git 和 Node.js 22.12 或更新版本。本地服务不需要安装 npm 依赖。

```sh
git clone https://github.com/houxingyu782-glitch/canvas-lite-selfhost.git
cd canvas-lite-selfhost
npm start
```

打开 <http://127.0.0.1:8787>，填入学校的 Canvas 地址和你的个人访问令牌，「代理地址」留空。

常用环境变量：

| 变量 | 作用 |
| --- | --- |
| `CANVAS_HOST=https://canvas.example.edu` | 只转发到这个学校，并在登录页预填地址 |
| `PORT=8788` | 换端口（默认 8787） |
| `HOST=0.0.0.0` | 让同一 Wi-Fi 下的设备访问（默认只监听本机；同网段的人也能访问，用完关掉） |

## 部署到自己的 Cloudflare Pages

1. 克隆本仓库，在仓库目录运行 `npm ci`，再运行 `npx wrangler login`（或者按下文用 API Token）。
2. 创建 Direct Upload 项目，把 `my-canvas-lite` 换成自己的项目名：

   ```sh
   npx wrangler pages project create my-canvas-lite --production-branch main
   ```

3. 在 Cloudflare 打开 **Workers & Pages → 项目 → Settings → Variables and Secrets**，在 **Production** 环境添加文本变量 `CANVAS_ORIGIN`。值为学校 Canvas 的**最终** HTTPS 地址，只写到域名，例如 `https://canvas.example.edu`（不带路径和结尾的 `/`）。
4. 上传：

   ```sh
   npx wrangler pages deploy public --project-name my-canvas-lite --branch main
   ```

5. 打开 Wrangler 显示的 `*.pages.dev` 地址。登录页已经填好学校地址，只需粘贴自己的令牌，「代理地址」留空。

- 改了 `CANVAS_ORIGIN` 后要重新部署才生效；一个 Pages 项目对应一个 Canvas 域名
- 部署会同时上传网页和 `public/_worker.js`。登录后发往 Canvas 的请求会经过这个代理，包含你的 Canvas 令牌，所以**只使用自己管理或信任的部署**
- 仓库根目录不要放 `wrangler.toml`，否则 `pages deploy` 会把它当成 Worker 项目

参考：[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [Pages 环境变量](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables)

### 用 Cloudflare API Token 部署（适合 CI 或没有浏览器的环境）

在 Cloudflare 创建权限为 **Account → Cloudflare Pages → Edit** 的 API Token。运行 Wrangler 前设置环境变量 `CLOUDFLARE_API_TOKEN`（这个 Token）和 `CLOUDFLARE_ACCOUNT_ID`（你的账户 ID），然后运行上面的创建和部署命令。参考：[在 CI 里直传](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

Cloudflare API Token 只用来发布网站，放在本机或 CI 的密钥配置里；Canvas 令牌只在应用的登录页填写。两者不要混用，也都不要提交到仓库。

### 更新到新版本

```sh
git pull
npm ci
npx wrangler pages deploy public --project-name my-canvas-lite --branch main
```

刷新页面即可。如果浏览器还显示旧版，在应用的「设置 → 强制更新到最新版」里更新；已添加到主屏幕的 PWA 不需要重装。

## 获取 Canvas 个人访问令牌

1. 浏览器登录学校 Canvas，打开 **Account → Settings**
2. **Approved Integrations → + New Access Token**
3. 用途随便填，**Expires（过期时间）留空**，令牌就不会过期
4. **Generate Token**，复制生成的字符串，粘贴到登录页

能否创建令牌取决于学校政策。令牌等于账号钥匙，不要发给别人，也不要提交到仓库；不用时在同一页面 **Delete** 撤销。令牌只保存在你自己的浏览器里，每台设备各填一次。

## 代理做了哪些限制

`server/server.mjs` 和 `public/_worker.js` 都只为读取 Canvas 数据服务：

- 只允许 `GET` / `HEAD`
- Pages 代理只转发到 `CANVAS_ORIGIN` 这一个域名，登录页填的地址必须与它一致
- 只转发 `Authorization` 请求头，另带一个固定的 User-Agent（Canvas 前面的 CloudFront 会拒绝没有 User-Agent 的请求）；不转发 Cookie，不跟随重定向
- 回传的响应头只保留内容类型、分页和限流相关的几个

## 常见问题

| 提示 | 原因和处理 |
| --- | --- |
| 请在 Cloudflare Pages 设置中配置 CANVAS_ORIGIN | 没设变量，或格式不对（必须 `https://` 开头、只到域名）。设好后重新部署 |
| 登录页的 Canvas 地址必须与站点配置的 CANVAS_ORIGIN 一致 | 登录页填的地址和 `CANVAS_ORIGIN` 不同。「设置 → 退出登录」后用预填的地址重新登录 |
| Canvas 返回了重定向 | `CANVAS_ORIGIN` 不是最终地址（学校地址会跳转），换成跳转后的地址再部署 |
| 代理无法连接 Canvas | Cloudflare 暂时连不上学校 Canvas，稍后刷新 |
| Canvas 令牌无效或已过期 | 令牌没复制完整或已被撤销，回 Canvas 重新生成 |
| 请求太频繁 | Canvas 对每个账号每 10 分钟约 700 次请求，等几分钟再刷新 |
| 成绩占比和课程大纲对不上 | 占比来自 Canvas 里的作业分组权重；老师没设权重时只能按分值折算。以大纲和 Canvas 为准 |
| 「今天」的时间线是空的 | 学校可能关了 Planner，这时只显示 Canvas 待办；两者都没有就是真的没有待办 |
| 页面还是旧版 | 「设置 → 强制更新到最新版」 |

## 开发与测试

```sh
npm ci
npx playwright install chromium
npm test
```

`npm test` 先跑代理和成绩计算的单元测试（15 项），再用模拟 Canvas 和测试令牌跑端到端测试（80 项），不需要真实令牌。测试占用端口 8787、8788、9911、9912，运行前先停掉占用这些端口的服务。

```
public/
  index.html, manifest.webmanifest, sw.js, icons/
  _worker.js       Cloudflare Pages 同源代理
  js/api.js        Canvas REST 封装（分页、错误、限流、缓存）
  js/app.js        路由、页面、详情面板、搜索
  js/grades.js     成绩构成计算
  css/style.css
server/server.mjs  本地静态托管 + 代理
test/              单元测试、端到端测试、模拟 Canvas
```

改了 `public/` 下的文件，记得同时改 `public/js/app.js`、`public/sw.js` 和 `package.json` 里的版本号，否则浏览器的 Service Worker 会继续用旧缓存。

## 使用许可

本仓库的代码可用于自行部署和运行 Canvas Lite。非官方项目，与 Instructure 无关。
