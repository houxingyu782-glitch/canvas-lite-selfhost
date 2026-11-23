# Canvas Lite 自托管版

用自己的 Canvas 个人访问令牌查看今天要交的作业、各门课的作业、公告、课件和成绩。不用反复过学校的 SSO 验证，手机和电脑都有专门的布局。应用可以在本机运行，也可以部署到你自己的 Cloudflare Pages 项目。

Canvas Lite 只读取数据：提交作业、测验、讨论回复等操作仍在学校 Canvas 完成。

## 功能

- **今天**：逾期 / 今天截止 / 7 天内 / 未读公告四个数字，未来 7 天日期条，按天分组的作业和日程时间线，可隐藏已完成
- **课程**：每门课的当前成绩和下一项作业；课程详情有概览、作业（可筛待完成 / 已完成）、公告、模块（文件站内直接下载）、成绩
- **公告**：所有课程最近 45 天的公告汇总，按课程筛选，未读标记
- **成绩**：平均分、各课程分数条、最近出分的作业
- **搜索**：<kbd>/</kbd> 或 <kbd>Ctrl/⌘ K</kbd>，搜课程、作业、公告和模块里的资料
- **布局**：手机底部四个标签，详情全屏显示；电脑左侧栏，宽屏时详情停靠在右侧，列表和详情同屏
- 浅色 / 深色模式，可添加到手机主屏幕（PWA）

## 在本机运行

安装 Git 和 Node.js 22.12 或更新版本，然后运行以下命令。

```sh
git clone https://github.com/houxingyu782-glitch/canvas-lite-selfhost.git
cd canvas-lite-selfhost
npm start
```

打开 [本地 Canvas Lite](http://127.0.0.1:8787)。填入学校的 Canvas 地址和你自己的 Canvas 个人访问令牌，代理地址留空。本地服务无需安装 npm 依赖，默认只监听本机。

想让登录页自动填好学校地址，启动时加上环境变量：

```sh
CANVAS_HOST=https://canvas.example.edu npm start
```

## 部署到自己的 Cloudflare Pages

1. 克隆本仓库，在仓库目录运行 `npm ci`，再运行 `npx wrangler login`。如使用部署令牌，可按下一节设置环境变量并跳过交互登录。
2. 运行以下命令创建 Direct Upload 项目。将 `my-canvas-lite` 换成自己的项目名。

   ```sh
   npx wrangler pages project create my-canvas-lite --production-branch main
   ```

3. 打开 Cloudflare 的 **Workers & Pages → 项目 → Settings → Variables and Secrets**。在 **Production** 环境添加文本变量 `CANVAS_ORIGIN`。值为学校 Canvas 的最终 HTTPS 地址，例如 `https://canvas.example.edu`，填写到域名为止，不带路径和结尾的 `/`。
4. 上传应用。

   ```sh
   npx wrangler pages deploy public --project-name my-canvas-lite --branch main
   ```

5. 打开 Wrangler 显示的 Pages 地址。登录页已经自动填好 `CANVAS_ORIGIN` 的地址，只需粘贴自己的 Canvas 个人访问令牌，代理地址留空。

改了 `CANVAS_ORIGIN` 后需要重新部署才会生效。每个 Pages 部署对应一个 Canvas 域名。

部署命令会同时上传网页和 `public/_worker.js` 同源代理。托管平台会转发登录后发往 Canvas 的请求，包含你自己的 Canvas 令牌。使用自己管理或信任的部署。

[Cloudflare Direct Upload 文档](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [Pages 环境变量文档](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables)

### 用 Cloudflare API Token 部署

在 Cloudflare 为自己的账户创建具有 **Account → Cloudflare Pages → Edit** 权限的 API Token。将它作为 `CLOUDFLARE_API_TOKEN`，将自己的账户 ID 作为 `CLOUDFLARE_ACCOUNT_ID` 注入运行 Wrangler 的 shell 或 CI。设置后即可运行上面的项目创建和部署命令。

Cloudflare API Token 用于发布，Canvas 个人访问令牌用于登录。Cloudflare 部署凭据放在本机或 CI 的密钥配置里，Canvas 令牌只在应用登录页填写。

[Cloudflare API Token 部署文档](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

### 更新到新版本

```sh
git pull
npm ci
npx wrangler pages deploy public --project-name my-canvas-lite --branch main
```

部署后刷新页面即可。如果浏览器还显示旧版，在应用的「设置 → 强制更新到最新版」里更新；已添加到主屏幕的 PWA 不需要重装。

## 获取 Canvas 个人访问令牌

在学校 Canvas 打开 **Account → Settings → Approved Integrations → + New Access Token**。用途随便填，**Expires（过期时间）留空**令牌就不会过期。生成后将令牌粘贴到本机或自己的 Pages 站点。是否能创建令牌取决于学校的政策。可在同一页面撤销令牌。

令牌等同于密码，不要发给别人，也不要提交到仓库。

## 代理做了哪些限制

本机服务（`server/server.mjs`）和 Pages 代理（`public/_worker.js`）都只为读取 Canvas 数据服务：

- 只允许 `GET` / `HEAD` 请求
- Pages 代理只转发到 `CANVAS_ORIGIN` 这一个域名，登录页填的地址必须与它一致
- 只转发 `Authorization` 请求头，不转发 Cookie；不跟随重定向
- 回传的响应头只保留内容类型、分页和限流相关的几个

## 常见问题

| 提示 | 原因和处理 |
| --- | --- |
| 请在 Cloudflare Pages 设置中配置 CANVAS_ORIGIN | 没有设置变量，或格式不对（必须是 `https://` 开头、只到域名）。设置后重新部署 |
| 登录页的 Canvas 地址必须与站点配置的 CANVAS_ORIGIN 一致 | 登录页填的地址和 `CANVAS_ORIGIN` 不同。在「设置 → 退出登录」后用预填的地址重新登录 |
| 代理无法连接 Canvas | `CANVAS_ORIGIN` 不是最终地址（学校地址会跳转到别的域名），换成跳转后的地址再部署 |
| Canvas 令牌无效或已过期 | 令牌复制不完整或已被撤销，回 Canvas 重新生成 |
| 请求太频繁 | Canvas 对每个账号每 10 分钟有请求上限，等几分钟再刷新 |
| 「公告」页没有内容 | 只显示最近 45 天的公告；如果提示加载失败，点右上角刷新重试 |

## 测试

```sh
npm ci
npx playwright install chromium
npm test
```

`npm test` 先运行 Pages 代理的单元测试，再用模拟 Canvas 和测试令牌运行端到端测试。测试服务占用本机端口 8787、8788、9911、9912，运行前先停止占用这些端口的开发服务。

## 使用许可

本仓库的代码可用于自行部署和运行 Canvas Lite。
