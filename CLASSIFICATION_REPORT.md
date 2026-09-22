# Music Visual Archive — Genre Classification Report

更新时间：2026-09-22

## 当前实现

Spotify 收藏读取完成后，基础专辑库会先进入页面；随后分类引擎在后台逐张处理专辑。分类结果保存在每张 LibraryAlbum.classification 中，包含专辑 ID、来源平台、主类型、次类型、原始标签、分类来源、置信度、用户覆盖标记和时间戳。

MusicBrainz 适配器使用 release-group 搜索，再用专辑名、主要艺人和发行年份进行匹配确认；只有达到可靠匹配阈值才采用返回的 genre/tag。匹配失败、没有标签、网络失败或请求被限流的专辑保持未分类，并继续出现在 All Albums。

MusicBrainz 请求使用单队列、约 1.1 秒间隔、30 天本地缓存；失败结果只缓存 10 分钟，避免永久保留临时网络错误。请求带有 Music Visual Archive/0.1 (local development) User-Agent。

## 内部空间映射

src/genre-classification.ts 中的同义词表将原始标签映射到 POP、ELECTRONIC、R&B / SOUL、HIP-HOP、INDIE / ALTERNATIVE、ROCK、JAZZ、CLASSICAL / AMBIENT、DANCE / CLUB。一个专辑可以有多个空间，同时保留第一个匹配空间作为主空间。

## 当前浏览器验证

当前浏览器处于 Demo 模式，没有已授权的 Spotify 账户，因此本次无法报告真实收藏分类成功率。

Demo 档案验证结果：

- All Albums：3
- Electronic：1
- Indie / Alternative：1
- Classical / Ambient：1
- 其他空间：0
- 未分类：0

THE INDEX 和 Genre World 已读取同一分类结果；用户在专辑页保存的手动分类仍优先于自动结果。

## 仍需真实账户验证

连接 Spotify 后，首次读取会显示基础收藏，后台状态会显示 CLASSIFYING completed / total。分类完成后 THE INDEX 会显示 classified / unclassified，每个文件夹的数量和代表封面来自当前收藏。真实账户的 MusicBrainz 可匹配率、失败原因和九个空间数量需要在该账户授权后记录。
