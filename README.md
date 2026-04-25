# One World Radio Now Playing Chrome Extension

这个扩展只针对：

`https://www.youtube.com/watch?v=UFYFO9YLItI`

它会截取当前可见 YouTube 播放器中左下角的 `Now Playing` 区域，用本地打包的 Tesseract.js OCR 识别歌手和歌名，然后用网易云音乐搜索接口匹配歌曲页。匹配不到直接歌曲页时，会退回到网易云搜索 URL。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择这个目录：`/Users/denis/Desktop/Digital_Garden/youtube-now-playing-extension`。

## 使用

1. 打开目标 YouTube 页面，并让视频里的左下角曲名区域保持在屏幕上。
2. 点击 Chrome 工具栏里的扩展图标。
3. 弹窗会连接当前标签页，并在页面右上角显示一个小浮层。
4. 点“识别一次”读取当前歌曲；点“开始监听”会每 30 秒识别一次。
5. 识别结果里的链接是网易云歌曲页或搜索页，点一下会跳转打开。

首次 OCR 会加载本地英文模型，可能需要几秒。扩展使用 `activeTab` 做当前标签页截图授权，所以如果页面提示无法截图，重新点击一次扩展图标即可。

如果 OCR 为空，优先把 YouTube 切到剧场模式或全屏，让左下角曲名在截图里更大一些；这个直播的曲名是画在视频里的，不是 DOM 文本，所以可见尺寸会影响识别率。

## 文件说明

- `manifest.json`: Manifest V3 配置和权限。
- `popup.html` / `popup.css` / `popup.js`: 扩展弹窗。
- `content.js`: 页面浮层、截图裁剪、OCR 和解析逻辑。
- `background.js`: 当前标签页截图和网易云搜索结果解析。
- `vendor/`: 本地打包的 Tesseract.js、WASM 和英文模型。
