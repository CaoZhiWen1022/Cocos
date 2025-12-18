/** ui层级 */
enum UILayer {
    /** 全屏界面层 */
    panelLayer = 'panelLayer',
    /** 弹窗层 */
    popupLayer = 'popupLayer',
    /** 引导层 */
    GuideLayer = 'GuideLayer',
    /** 全屏遮罩层 */
    FullScreenMask = 'FullScreenMask',
    /** tips */
    Tips = 'Tips',
    /** fly */
    Fly = 'Fly',
}
/** ui类型 */
enum UIType {
    /** 全屏 */
    Panel = 0,
    /** 弹窗 */
    Popup = 1,
}
/**
 * 弹窗权重 同权重按照入队顺序打开，高权重进入队列时关闭低权重并打开，等待高权重关闭后再打开被关闭的界面
 */
enum PopupPriority {
    /** 普通 */
    Normal = 1,
    /** 中 */
    Middle = 2,
    /** 高 */
    High = 3,
    /** 最高 */
    Highest = 4,
}
(window as any).UILayer = UILayer;
(window as any).UIType = UIType;
(window as any).PopupPriority = PopupPriority;
