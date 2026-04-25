# PartyCue

把电台直播里的当前歌名抓出来，让派对继续往前跳。

![PartyCue demo showing a YouTube radio now-playing label](docs/partycue-demo.png)

PartyCue 是一个粉红主色、浅蓝辅助的 Chrome 扩展。它会在指定 YouTube 电台直播画面里截取左下角 `Now Playing` 区域，用本地打包的 Tesseract.js 做 OCR，识别歌手和歌名，然后把你带去网易云音乐的歌曲页或搜索页。

当前支持的直播页面：

`https://www.youtube.com/watch?v=UFYFO9YLItI`

## 小亮点

- 粉蓝派对风 UI，开心、轻快、开场即上头。
- 本地 OCR 识别视频画面里的歌名，不依赖页面 DOM。
- 一键识别当前歌曲，也可以每 30 秒自动监听一次。
- 匹配到网易云歌曲页就直达，匹配不到就打开搜索结果。
- MIT 免费开源，欢迎改造、玩耍、加灯光。

## 安装

1. 下载或克隆这个项目。
2. 打开 Chrome 的 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目文件夹。

## 使用

1. 打开支持的 YouTube 直播页面。
2. 让视频左下角的 `Now Playing` 区域保持可见。
3. 点击 Chrome 工具栏里的 PartyCue 图标。
4. 点“识别一次”抓取当前歌曲。
5. 点“开始监听”进入自动派对模式，每 30 秒识别一次。
6. 点击识别结果里的链接，去网易云继续听。

首次 OCR 会加载本地英文模型，可能需要几秒。扩展使用 `activeTab` 截图授权，如果提示无法截图，重新点击一次扩展图标通常就能重新开灯。

## OCR 小贴士

如果识别结果为空，可以试试这些动作：

- 把 YouTube 切到剧场模式或全屏。
- 确保左下角曲名区域没有被字幕、控制条或窗口边缘遮挡。
- 等直播画面稳定后再点“识别一次”。

这个直播的曲名是画在视频里的，不是网页文本，所以画面尺寸和清晰度会影响识别率。

## 项目结构

- `manifest.json`: Chrome Manifest V3 配置。
- `popup.html` / `popup.css` / `popup.js`: 扩展弹窗。
- `content.js`: 页面浮层、截图裁剪、OCR 解析和监听逻辑。
- `background.js`: 当前标签页截图和网易云搜索结果解析。
- `offscreen.html` / `offscreen.js`: 离屏 OCR 工作区。
- `icons/`: PartyCue 粉蓝开心图标。
- `vendor/`: 本地打包的 Tesseract.js、WASM 和英文模型。

## 开发

安装依赖：

```bash
npm install
```

检查脚本语法：

```bash
npm run check
```

改完代码后，在 `chrome://extensions/` 里点 PartyCue 的刷新按钮，再回到直播页面试一下。

## 许可证

MIT License. 免费、开放、欢迎 remix。愿你的播放列表永远有光。
