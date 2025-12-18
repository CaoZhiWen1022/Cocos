# FGUI Game Framework

基于 Cocos Creator 和 FairyGUI 的游戏 UI 框架。

## 项目结构

所有 TypeScript 源文件都使用 `namespace GameFrame$` 命名空间，编译后生成单个 JS 文件和 d.ts 声明文件。

### 源文件

- `UIFrameConfig.ts` - 框架配置
- `UIEnum.ts` - 枚举定义（UILayer, UIType, PopupPriority）
- `OpenUIParam.ts` - UI 打开参数类型
- `UIRegister.ts` - UI 注册管理
- `UIBundleMgr.ts` - Bundle 和 Package 加载管理
- `UIBase.ts` - UI 基类
- `UIPanel.ts` - 全屏面板基类
- `UIPopup.ts` - 弹窗基类
- `UIFrame.ts` - UI 管理器
- `TimerMgr.ts` - 定时器管理
- `PopupQueueMgr.ts` - 弹窗队列管理
- `GameFrame.ts` - 框架主类

### 构建输出

- `dist/GameFrame.js` - 编译后的 JavaScript 文件
- `dist/GameFrame.d.ts` - TypeScript 类型声明文件

## 构建命令

```bash
# 安装依赖（仅需一次）
npm install

# 构建
npm run build

# 监听模式（自动重新构建）
npm run build:watch
```

## 使用方式

### 在 HTML 中引入

```html
<script src="dist/GameFrame.js"></script>
<script>
  // GameFrame 已挂载到 window 对象
  const frame = GameFrame.ins;
  frame.init();
</script>
```

### 在 TypeScript 中使用

```typescript
/// <reference path="dist/GameFrame.d.ts" />

// 初始化框架
const frame = GameFrame.ins;
frame.initUIFrameConfig(750, 1334, ["Common"], ["Common"], 5, 0.6);
frame.init();

// 注册 UI
frame.uiFrame.registerUI({
  UIID: 1,
  UIType: GameFrame.UIType.Panel,
  UILayer: GameFrame.UILayer.panelLayer,
  createInstance: () => fgui.UIPackage.createObject("PackageName", "ComponentName"),
  _class: MyPanelClass,
  uiPackage: ["PackageName"],
  uiRes: []
});

// 打开 UI
frame.uiFrame.open({
  UIID: 1,
  data: { /* 自定义数据 */ }
});
```

## 命名空间说明

项目使用 `GameFrame$` 作为内部命名空间，所有类都在此命名空间下：

- `GameFrame$.UIFrameConfig`
- `GameFrame$.UIFrame`
- `GameFrame$.UIBase`
- `GameFrame$.UIPanel`
- `GameFrame$.UIPopup`
- `GameFrame$.TimerMgr`
- `GameFrame$.PopupQueueMgr`
- `GameFrame$.UIBundleMgr`
- `GameFrame$.UIRegister`
- `GameFrame$.UILayer`
- `GameFrame$.UIType`
- `GameFrame$.PopupPriority`
- `GameFrame$.GameFrame` - 主类

主类 `GameFrame$.GameFrame` 被导出到 `window.GameFrame`，方便外部使用。

## 许可证

MIT

