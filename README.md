# kozha

面向 [Komari Monitor](https://github.com/komari-monitor/komari) 的自定义主题，仓库地址为 [telly3e/kozha](https://github.com/telly3e/kozha)。

## 功能特性

### 首页与视觉

- 内置动态极光背景，可在主题配置中开关
- 暗色模式使用更深、更柔和的动态粒子背景
- 浅色模式使用更鲜明的动态渐变背景
- 支持自定义桌面端/移动端背景图片
- 支持自定义 Logo、插图、主题模式和导航链接

### 分组与地区筛选

- 首页支持服务器分组筛选
- 移动端分组自动切换为下拉栏，避免控件拥挤
- 支持按服务器地区筛选，并显示地区旗帜
- 中文界面显示中文地区名，其余语言显示英文地区名
- 可在主题配置中选择使用 Emoji 旗帜或 SVG 旗帜
- 支持通过 `GroupOrder` 自定义首页分组顺序，未列出的分组会按名称排列

### 流量进度条

- 服务器卡片内置流量使用进度条，无需外部脚本
- 支持所有流量计算模式：`sum`、`max`、`min`、`up`、`down`
- 支持按使用百分比显示 HSL 渐变色
- 轮播显示使用百分比、重置倒计时和计费类型
- 使用服务器 ID 精确匹配，避免重名导致的匹配问题

### 账单与资产

- 支持默认账单货币设置
- 支持通过服务器 tags 元标签或 JSON 配置覆盖单台服务器货币
- 支持人民币符号显示风格切换
- 可选显示资产统计浮窗

### 服务监控与地图

- 可在主题配置中开关首页服务监控按钮和面板
- 支持 30 天服务可用性监控，按日统计在线/离线/延迟
- 优先使用 Komari 的公开 Ping 接口，并兼容旧版 `common:getRecords` 返回结构
- 可在主题配置中开关全球地图

### 网络监控图表

- 机器详情页提供独立的 Network 视图
- 新版 Komari 优先使用 Metric API 查询 `ping.latency_ms`
- 同时使用 `ping.loss` 计算丢包率，并按 Metric 样本数对聚合结果加权
- 延迟检测时长根据 `ping.latency_ms` 与 `ping.loss` 的后台保留时长动态生成
- 默认提供 `1h`、`12h`、`24h`、`3d`、`7d`、`30d`，超出默认范围时追加后台配置的准确时长
- 后台保留 3 天时显示到 `3d`，保留 14 天时追加 `14d`，保留 40 天时追加 `40d`
- 按时间范围请求合适的显示粒度：`1h`/`12h` 约 1 分钟一个点，`24h` 约 3 分钟一个点，超过 24 小时约 30 分钟一个点
- Ping 任务顺序跟随 `public:getPublicPingTasks` 返回的后台任务配置顺序，避免 Metric API 返回顺序造成排列变化
- 旧版 Komari 没有 Metric API 时自动回退到兼容接口
- 支持点击顶部探针卡片聚焦单个或多个监控项
- 支持点击底部图例隐藏或恢复对应曲线
- 多条探针曲线使用统一时间点降采样，鼠标悬停时可同时查看各曲线数值
- 支持 Peak cut 削峰，让异常峰值场景下的趋势更易读

### 标签系统

- 支持以 `;` 分隔多个标签，匹配 Komari 后端格式
- 支持颜色标签，例如 `So-net<red>;CDN<blue>`
- 支持 Radix UI 颜色名：Gray、Gold、Red、Blue、Green、Purple、Teal、Sky 等
- 未指定颜色的标签会根据文本哈希自动分配颜色

## 安装方法

### 通过 Komari 管理面板上传

1. 从 [Releases](https://github.com/telly3e/kozha/releases) 下载最新的主题 zip 文件
2. 进入 Komari 管理面板 -> 主题管理
3. 上传 zip 文件并启用主题

### 从源码构建

```bash
git clone https://github.com/telly3e/kozha.git
cd kozha
npm install
npm run build
```

构建完成后，将 `dist/`、`komari-theme.json`、`preview.png` 打包为 zip 文件，并上传到 Komari 主题管理。发布工作流会自动生成符合 Komari 主题结构的 zip 包。

更新主题时需要替换完整的 `dist/` 目录和 `komari-theme.json`。如果浏览器仍显示旧版资源，请执行强制刷新；Vite 构建生成的资源文件名会随版本变化。

### 分组顺序配置

在 Komari 主题管理中设置 `GroupOrder`，可以使用逗号、换行或 JSON 数组指定分组顺序，例如：

```text
香港,日本,美国
```

也可以填写：

```json
["香港", "日本", "美国"]
```

`All` 始终固定在最前面；未列出的分组会按名称排序并排在已配置分组之后。

## 开发

```bash
npm install
npm run dev
npm run build
```

主要配置位于 `komari-theme.json`，使用 Komari 官方 managed 配置类型。主题设置会通过 Komari 管理面板写入，前端通过全局主题配置读取；外观模式使用官方推荐的 `appearance` 本地存储键，并兼容旧版 `vite-ui-theme`。

## 技术栈

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 3
- TanStack React Query
- Recharts
- Framer Motion
- i18next

## Credits
本项目参考了以下开源项目，特别感谢他们的分享！
https://github.com/Akizon77/nezha-dash-v1
https://github.com/BITJEBE/nezha-BITJEBE
https://codepen.io/Jiironimo/pen/PwGOdoL

## 许可证
Apache-2.0
