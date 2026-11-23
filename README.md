# Canvas Lite 自托管版

用自己的 Canvas 个人访问令牌查看课程、作业、公告和成绩。手机支持课程切换，电脑支持侧栏和详情面板。应用可在本机运行，也可部署到自己的 Cloudflare Pages 项目。

## 在本机运行

安装 Git 和 Node.js 22.12 或更新版本，然后运行以下命令。

```sh
git clone https://github.com/houxingyu782-glitch/canvas-lite-selfhost.git
cd canvas-lite-selfhost
npm start
```

打开 [本地 Canvas Lite](http://127.0.0.1:8787)。填入学校的 Canvas 地址和你自己的 Canvas 个人访问令牌，代理地址留空。本地服务无需安装 npm 依赖，默认只监听本机。

## 部署到自己的 Cloudflare Pages

1. 克隆本仓库，在仓库目录运行 `npm ci`，再运行 `npx wrangler login`。如使用部署令牌，可按下一节设置环境变量并跳过交互登录。
2. 运行以下命令创建 Direct Upload 项目。将 `my-canvas-lite` 换成自己的项目名。

   ```sh
   npx wrangler pages project create my-canvas-lite --production-branch main
   ```

3. 打开 Cloudflare 的 **Workers & Pages → 项目 → Settings → Variables and Secrets**。在 **Production** 环境添加文本变量 `CANVAS_ORIGIN`。值为学校 Canvas 的最终 HTTPS 地址，例如 `https://canvas.example.edu`，填写到域名为止。
4. 上传应用。

   ```sh
   npx wrangler pages deploy public --project-name my-canvas-lite --branch main
   ```

5. 打开 Wrangler 显示的 Pages 地址。登录页填入与 `CANVAS_ORIGIN` 相同的地址和自己的 Canvas 个人访问令牌，代理地址留空。改了变量后，重新部署。每个 Pages 部署对应一个 Canvas 域名。

部署命令会同时上传网页和 `public/_worker.js` 同源代理。托管平台会转发登录后发往 Canvas 的请求，包含你自己的 Canvas 令牌。使用自己管理或信任的部署。

[Cloudflare Direct Upload 文档](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [Pages 环境变量文档](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables)

### 用 Cloudflare API Token 部署

在 Cloudflare 为自己的账户创建具有 **Account → Cloudflare Pages → Edit** 权限的 API Token。将它作为 `CLOUDFLARE_API_TOKEN`，将自己的账户 ID 作为 `CLOUDFLARE_ACCOUNT_ID` 注入运行 Wrangler 的 shell 或 CI。设置后即可运行上面的项目创建和部署命令。

Cloudflare API Token 用于发布，Canvas 个人访问令牌用于登录。Cloudflare 部署凭据放在本机或 CI 的密钥配置里，Canvas 令牌只在应用登录页填写。

[Cloudflare API Token 部署文档](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

## 获取 Canvas 个人访问令牌

在学校 Canvas 打开 **Account → Settings → Approved Integrations → + New Access Token**。生成后将令牌粘贴到本机或自己的 Pages 站点。是否能创建令牌取决于学校的政策。可在同一页面撤销令牌。

Canvas Lite 只读取课程数据。提交作业、测验等操作在学校 Canvas 完成。

## 测试

```sh
npm ci
npx playwright install chromium
npm test
```

测试使用模拟 Canvas 和测试令牌。测试服务占用本机端口 8787、8788、9911、9912，运行前先停止占用这些端口的开发服务。

## 使用许可

本仓库的代码可用于自行部署和运行 Canvas Lite。
