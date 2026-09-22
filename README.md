# Music Visual Archive

个人音乐视觉档案。使用 React、TypeScript、Vite、React Router 和原生 CSS。首页基于 `public/references/land.png`，保留数字花朵交互；音乐库可选择 Spotify 个人收藏或明确标记的虚构 Demo Archive。

## 本地运行

需要 Node.js 22 与 npm。先复制 `.env.example` 为 `.env.local`，将你自己的 Spotify 应用 Client ID 填入：

```dotenv
VITE_SPOTIFY_CLIENT_ID=你的SpotifyClientID
```

`.env.local` 已被 Git 忽略；Client ID 是浏览器端公开配置，切勿填写 Client Secret。改动环境变量后必须重启 Vite。当前本地 `.env.local` 已使用用户提供的 Client ID，不会写入构建说明或输出令牌。

```sh
npm install
npm run dev
```

Vite 固定监听 `http://127.0.0.1:5173/`，端口被占用时会直接报错而不会自动换端口。Spotify Dashboard 的 Redirect URI、授权请求与代码均须**完全一致**：`http://127.0.0.1:5173/callback`。不要带尾部斜杠、空格或中文句号。如果 Dashboard 中保存的是 `http://127.0.0.1:5173/callback。`，请删除最后的 `。` 并保存。

```sh
npm run build
npm run preview
```

`build` 执行 TypeScript 检查并生成 `dist`；`preview` 预览构建产物。

## 页面

| 页面 | 路径 |
| --- | --- |
| Landing Page | `/` |
| Connect Your Library | `/connect` |
| Spotify callback | `/callback` |
| The Archive in Motion | `/motion` |
| The Index | `/index` |
| All Albums | `/albums` |
| Genre World | `/genres` |
| Album Detail | `/albums/:albumId` |
| Track Detail | `/tracks/:trackId` |

第一次登录：运行 `npm run dev` → 打开 `http://127.0.0.1:5173/` → `Enter Archive` → `Connect Spotify` → 在 Spotify 官方页面授权 → 返回 `/callback` → 自动进入 The Archive in Motion。Spotify Development mode 还要求应用所有者符合其当前 Premium 条件，并已把测试账户加入允许用户列表。浏览器中可随时“断开 Spotify”；Demo Archive 无需登录。

## 内容与后续工作

- `src/data.ts` 仅保存虚构 Demo 数据；真实收藏由 `src/library.tsx` 单独规范化。两种数据源不会混用。
- `src/spotify.ts` 使用 Spotify 官方 Authorization Code with PKCE：随机 verifier/challenge、state 校验、授权码交换、令牌刷新与断开连接。仅请求 `user-library-read`、`playlist-read-private` 和 `playlist-read-collaborative`。令牌仅保存在当前浏览器标签的 `sessionStorage`，不写入仓库，也不打印。
- `src/library.tsx` 分页读取 `/me/albums`、`/me/tracks`、`/me/playlists`。2026 年 Development mode 中，播放列表条目使用 `/playlists/{id}/items`，仅可读取自己拥有或协作的列表；无权读取的列表仅显示元信息与提示。真实专辑会尝试读取艺人的 Spotify genre 词条并按明确关键词映射到九个空间；该字段已被 Spotify 标记为废弃，可能为空。最多尝试前 60 位不同艺人，读取受限或词条不明确的专辑保留在 All Albums，仍可在专辑页本地手动覆盖。
- `src/main.tsx` 提供路由、连接页、回调与轻量章节导航；`src/visual.tsx` 提供 Motion、Index、All Albums、九个类型空间及专辑/曲目阅读页。
- `src/styles.css` 保留首页数字花朵的原有版式；`src/visual.css` 实现全站第一轮编辑式页面布局。三张 Demo 封面为明确标记的 CSS 虚构图形。
- Motion 页面按固定位置为真实收藏选取最多 30 张不同封面；Demo 仅显示三张，以缓慢同向轨道运动。约五秒后显示中央引导，也可提前进入 The Index。动画使用 CSS，并支持减少动态效果。
- `src/audio.tsx` 为入口和九个类型保留独立音源槽位，目前全部未配置合法音源，界面明确显示无音源。声音状态在路由外管理。`/genre/:id`、`/album/:id`、`/track/:id` 同时支持作为兼容路径。
- 生产部署时需配置 SPA 回退，将页面路由请求交给 `index.html`。

本站没有后端或 Spotify 播放功能，不下载商业录音。授权后访问令牌在浏览器标签会话内保持，过期时自动刷新；关闭标签或主动断开后需重新授权。若授权或读取失败，页面显示错误及重试入口。生产部署需要重新注册部署域名的 Redirect URI，并配置 SPA 路由回退。
