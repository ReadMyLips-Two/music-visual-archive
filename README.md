# Music Visual Archive

Music Visual Archive (MVA) is a desktop-first music archive that turns a personal library into a visual, genre-organized experience. The V1.0 visual direction is frozen; this repository preserves the current desktop worlds, album detail views, track detail views, and motion system.

## Overview

MVA connects to supported music providers, loads a user’s saved albums, and organizes them through the project’s genre-classification flow. Library and classification persistence is scoped to both provider and authenticated account identity so one account cannot inherit another account’s cached data.

## Core Experience

- Archive in Motion home experience
- Desktop genre worlds and index navigation
- Album library, album detail, and track detail views
- Spotify OAuth PKCE connection and saved-album loading
- Account-scoped library and genre classification persistence
- Lyrics lookup where supported by the current provider flow

## Current Integration

- **Spotify:** Implemented with browser-based OAuth PKCE. The Spotify Client ID is public configuration; no Client Secret belongs in this frontend.
- **Apple Music:** Partial integration. A secure backend endpoint must provide a signed MusicKit developer token; the Apple private key must remain server-side.
- **QQ Music:** Placeholder integration only; provider connection and library loading are not available yet.

## Tech Stack

- React 19 and React DOM
- TypeScript
- Vite
- React Router
- GSAP
- Native CSS and project-local visual assets

## Running Locally

需要 Node.js 22 与 npm。先复制 `.env.example` 为 `.env.local`，将你自己的 Spotify 应用 Client ID 填入：

```dotenv
VITE_SPOTIFY_CLIENT_ID=你的SpotifyClientID
```

Apple Music 连接还需要一个安全后端 endpoint。前端只请求签名后的 developer token；Apple Music 私钥、Team ID 和 Key ID 不能放进 Vite 或提交到仓库：

```dotenv
VITE_APPLE_MUSICKIT_APP_NAME=Music Visual Archive
VITE_APPLE_MUSICKIT_DEVELOPER_TOKEN_ENDPOINT=/api/apple-music/developer-token
```

endpoint 的最小响应格式是 `200 application/json`：

```json
{ "developerToken": "signed ES256 JWT" }
```

如果 endpoint 没有配置，Apple Music 行仍会显示在 `/connect`，但点击后会明确提示 setup required，不会伪造连接成功。

`.env.local` 已被 Git 忽略；Client ID 是浏览器端公开配置，切勿填写 Client Secret。改动环境变量后必须重启 Vite。不要把本地凭据写入 README、构建产物或 Git。

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

第一次连接 Spotify：运行 `npm run dev` → 打开 `http://127.0.0.1:5173/` → `Enter Archive` → `SPOTIFY / CONNECT` → 在 Spotify 官方页面授权 → 返回 `/callback` → 读取真实个人收藏。Spotify Development mode 还要求应用所有者符合其当前 Premium 条件，并已把测试账户加入允许用户列表。浏览器中可随时断开当前来源。

第一次连接 Apple Music：后端先提供上面的 developer-token endpoint → 打开 `/connect` → `APPLE MUSIC / CONNECT` → MusicKit on the Web 弹出 Apple 授权 → 授权后通过 MusicKit API 读取 `/v1/me/library/albums`、`/v1/me/library/songs` 和 `/v1/me/library/playlists`。Apple Music 的 Music User Token 由 MusicKit 管理，应用只在当前浏览器标签会话保存来源标记。

## Implementation Notes

- `src/library.tsx` 负责将 Spotify 返回的真实收藏规范化为档案数据。
- `src/apple-music.ts` 负责动态加载 Apple 官方 MusicKit JS v3、取得后端签发的 developer token、执行真实用户授权，并通过 MusicKit 的 pass-through API 读取 Apple Music 个人资料库。
- `src/providers.ts` 保存 Spotify / Apple Music / QQ Music 的来源状态；认证存储按 `mva.auth.spotify.*`、`mva.auth.apple.*`、`mva.auth.qq.*` 分 namespace。
- `src/spotify.ts` 使用 Spotify 官方 Authorization Code with PKCE：随机 verifier/challenge、state 校验、授权码交换、令牌刷新与断开连接。仅请求 `user-library-read`、`playlist-read-private` 和 `playlist-read-collaborative`。令牌仅保存在当前浏览器标签的 `sessionStorage`，不写入仓库，也不打印。
- `src/library.tsx` 分页读取 `/me/albums`、`/me/tracks`、`/me/playlists`。2026 年 Development mode 中，播放列表条目使用 `/playlists/{id}/items`，仅可读取自己拥有或协作的列表；无权读取的列表仅显示元信息与提示。真实专辑会尝试读取艺人的 Spotify genre 词条并按明确关键词映射到九个空间；该字段已被 Spotify 标记为废弃，可能为空。最多尝试前 60 位不同艺人，读取受限或词条不明确的专辑保留在 All Albums，仍可在专辑页本地手动覆盖。
- `src/lyrics.ts` 通过 LRCLIB 的 `/api/get` 按需读取当前打开曲目的歌词，并严格校验曲名、主艺人、专辑和时长。LRCLIB 的免费无密钥 API 不等于歌词著作权许可；公开部署前必须为歌词展示确认词作者/出版商或商业歌词供应商的展示授权。当前实现只作为个人、本地验证入口，不应视为已取得公开发行许可。
- `src/main.tsx` 提供路由、连接页、回调与轻量章节导航；`src/visual.tsx` 提供 Motion、Index、All Albums、九个类型空间及专辑/曲目阅读页。
- `src/styles.css` 保留首页数字花朵的原有版式；`src/visual.css` 实现全站第一轮编辑式页面布局。Motion 页面按固定位置为真实收藏选取最多 30 张不同封面，以缓慢同向轨道运动。约五秒后显示中央引导，也可提前进入 The Index。动画使用 CSS，并支持减少动态效果。
- `src/audio.tsx` 为入口和九个类型保留独立音源槽位，目前全部未配置合法音源，界面明确显示无音源。声音状态在路由外管理。`/genre/:id`、`/album/:id`、`/track/:id` 同时支持作为兼容路径。
- 生产部署时需配置 SPA 回退，将页面路由请求交给 `index.html`。

本站当前仓库没有后端实现或 Spotify 播放功能，不下载商业录音。Apple Music 要求新增一个安全服务端：使用 Apple Developer 的 Media ID / MusicKit 能力和 Media Services private key 生成 ES256 developer token，建议把 JWT 的 `origin` claim 限制到实际站点 origin，并将 endpoint 配置为前端可访问的同源路径或通过开发代理转发。私钥不得出现在 `.env` 的 `VITE_*` 变量、前端 bundle、浏览器 localStorage 或 Git 中。Apple developer token 的 `exp` 不能超过 Apple 要求的最长有效期；服务端应在过期前轮换。

Spotify 访问令牌在浏览器标签会话内保持并自动刷新；Apple Music 的 Music User Token 由 MusicKit on the Web 管理，应用不把它复制到自己的长期存储。关闭标签或主动断开后需重新授权。若授权或读取失败，页面显示错误及重试入口。生产部署需要注册实际 Spotify Redirect URI、让 developer-token endpoint 返回允许该 origin 使用的令牌，并配置 SPA 路由回退。

## Production Build

```sh
npm run test
npm run build
npm run preview
```

Production hosting must support SPA fallback routing. Configure the deployed Spotify redirect URI in both the application and Spotify Dashboard before enabling public sign-in.

## Known Limitations

- V1.0 is desktop-first; mobile layouts remain experimental and are not part of this release freeze.
- Apple Music requires a separately deployed secure developer-token endpoint.
- QQ Music is not implemented.
- Album metadata, lyrics, and artwork depend on provider/API availability.
- MVA does not provide Spotify playback or store provider private credentials.

## Status

V1.0 release candidate. The current desktop visual system is frozen. Remaining deployment work is provider configuration and hosting validation rather than visual redesign.
