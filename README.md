# 周晚餐菜谱管理

一个 React + Node.js 的本地全栈小工具，用来管理菜谱、生成一周晚餐、生成购物清单，并提供热门菜品灵感。

## 本地开发

```bash
npm install
npm run dev:full
```

- 前端开发地址：http://127.0.0.1:5173
- 后端 API 地址：http://127.0.0.1:8787

## 本机部署

```bash
npm run build:full
npm run start
```

部署后打开：

```text
http://127.0.0.1:8787
```

## 手机使用

先在电脑上启动后端部署版：

```bash
npm run build:full
npm run start
```

手机和电脑连接同一个 Wi-Fi 后，在手机浏览器访问：

```text
http://电脑局域网IP:8787
```

iPhone:

1. 用 Safari 打开上面的地址。
2. 点分享按钮。
3. 选择“添加到主屏幕”。

Android:

1. 用 Chrome 打开上面的地址。
2. 点右上角菜单。
3. 选择“添加到主屏幕”或“安装应用”。

添加后，它会像普通 App 一样出现在手机桌面。数据仍然保存在电脑后端的 `data/app-state.json`，所以手机需要能访问这台电脑或之后部署到云端。

## API

- `GET /api/health`：后端健康检查
- `GET /api/auth/me`：读取当前登录账号
- `POST /api/auth/register`：注册账号并登录
- `POST /api/auth/login`：账号密码登录
- `POST /api/auth/logout`：退出登录
- `GET /api/state`：读取菜谱、周菜单、购物清单勾选状态
- `PUT /api/state`：保存完整应用状态
- `GET /api/trends`：读取热门菜品灵感
- `GET /api/ai-trends`：读取 DeepSeek 热门菜品报告
- `POST /api/ai-trends/refresh`：立即刷新 DeepSeek 热门菜品报告
- `POST /api/ai-trends/ingredient`：按某个食材生成 DeepSeek 热门菜品推荐

## DeepSeek 热门菜品

配置 DeepSeek API Key 后，后端会每隔 2 天调用 DeepSeek API，整理热门菜品方向，再按不同国家/菜系推荐。

注意：这里使用的是 DeepSeek 文本模型接口，不是实时热榜抓取器。页面会同时提供小红书/B站搜索入口，方便你点进去核对实际内容热度。

复制一份环境变量文件：

```bash
cp .env.example .env
```

然后在 `.env` 里填写：

```bash
DEEPSEEK_API_KEY=你的 key
DEEPSEEK_MODEL=deepseek-v4-flash
```

如果没有配置 `DEEPSEEK_API_KEY`，应用会自动显示本地备用推荐，不影响其他功能。

AI 菜系页支持输入食材，例如 `土豆`、`虾`、`鸡胸肉`，后端会调用 DeepSeek 生成围绕该食材的不同国家菜系热门菜品。

AI 推荐会保存到：

```text
data/ai-trends.json
```

## 数据存储

后端支持两种保存方式：

- 配置了 `DATABASE_URL`：保存到 PostgreSQL/Supabase，适合线上多人访问。
- 没配置 `DATABASE_URL`：保存到本机文件，适合本地个人使用。

本地文件路径是：

```text
data/app-state.json
```

这个文件已被 `.gitignore` 忽略，避免把个人菜谱数据提交到 Git。

AI 推荐缓存同样会跟随存储方式切换：有数据库时保存到 PostgreSQL，没有数据库时保存到 `data/ai-trends.json`。

### 账号登录

应用现在支持账号注册和账号密码登录：

- 每个账号有自己的菜谱库、周菜单和购物清单。
- 新账号第一次进入时，会自动带入一份初始菜谱数据。
- 密码不会明文保存，后端只保存加盐哈希。
- 登录状态通过 HttpOnly Cookie 保存，默认有效期 30 天。

如果使用 PostgreSQL/Supabase，账号、登录会话和每个账号的应用数据都会保存在数据库里。如果本地没有配置 `DATABASE_URL`，账号数据会保存到 `data/auth.json`，应用数据会保存到每个账号对应的 `data/app-state-*.json`。

### Supabase / PostgreSQL

如果你已经创建了 Supabase 项目，把 Supabase 的连接字符串填到环境变量：

```bash
DATABASE_URL=postgresql://...
```

注意：

- 连接字符串里不要保留 `[YOUR-PASSWORD]` 这种占位符，要替换成真实数据库密码。
- 不要把 `DATABASE_URL` 写进 Git，也不要发在聊天或截图里。
- 后端第一次启动时会自动创建 `app_kv` 表，用来保存菜谱、菜单、购物清单和 AI 推荐缓存。
- `/api/health` 会返回当前存储方式，`storage: "postgres"` 表示已经在用数据库。

## Docker 部署

```bash
docker build -t weekly-dinner-planner .
docker run -p 8787:8787 -v "$(pwd)/data:/app/data" weekly-dinner-planner
```

然后打开：

```text
http://127.0.0.1:8787
```

## 云平台部署建议

适合部署到 Render、Railway、Fly.io 等 Node.js 平台。

### Render 一键部署

仓库根目录已包含 `render.yaml`，可以用 Render Blueprint 直接部署：

1. 打开 https://dashboard.render.com/blueprints
2. 选择 GitHub 仓库 `humanduo/weekly-dinner-planner`
3. Render 会读取 `render.yaml`
4. 在创建流程里填写 `DEEPSEEK_API_KEY`
5. 如果要长期保存线上数据，填写 `DATABASE_URL`
6. 创建后等待部署完成，访问 Render 给出的 `onrender.com` 地址

当前配置使用 Render 免费 Web Service，适合先分享和试用。免费服务会在一段时间无访问后休眠，首次打开可能需要等待约一分钟；如果已配置 `DATABASE_URL`，数据会保存到 Supabase/PostgreSQL，不受 Render 免费服务临时文件系统影响。

Render 配置：

- Build Command: `npm ci --include=dev && npm run build:full`
- Start Command: `npm run start`
- Health Check Path: `/api/health`
- Region: `singapore`
- Environment Variables:
  - `DEEPSEEK_API_KEY`: 在 Render 控制台填写，不要提交到 Git
  - `DEEPSEEK_MODEL`: `deepseek-v4-flash`
  - `DATABASE_URL`: Supabase/PostgreSQL 连接字符串，不要提交到 Git

### 通用 Node.js 平台

- Build Command: `npm run build:full`
- Start Command: `npm run start`
- Environment Variables:
  - `PORT`: 云平台通常会自动注入
  - `DATA_DIR`: 可选，默认 `./data`
  - `DATABASE_URL`: 可选，配置后使用 PostgreSQL 保存数据

如果不使用数据库但要长期保存数据，请选择带持久磁盘的服务，并把 `DATA_DIR` 指向持久磁盘路径。
