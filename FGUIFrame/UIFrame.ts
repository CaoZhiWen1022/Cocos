
class UIFrame {

    popupQueueMgr: PopupQueueMgr;

    uiLayerMap: { [key: string]: fgui.GComponent } = {};
    /** 打开中的UI */
    private openings: number[] = [];

    /** 打开的UI */
    private openUIs: UIBase[] = [];

    /** 被隐藏的ui */
    private concealUIs: UIBase[] = [];

    /** 全屏遮罩组件 */
    private fullMaskUI: UIFullMask;

    /** 弹窗背景组件的创建方法 */
    private popupMaskCreateFunc: () => fgui.GComponent;

    constructor() {
        this.popupQueueMgr = new PopupQueueMgr();
    }

    /** 游戏启动时初始化 */
    gameLaunchInit() {
        fgui.GRoot.create();
        this.initUILayer();
    }

    private initUILayer() {
        for (let layer in UILayer) {
            let com = new fgui.GComponent();
            com.name = layer;
            fgui.GRoot.inst.addChild(com);
            this.uiLayerMap[layer] = com;
        }
    }

    /** 加载界面时初始化 */
    async gameLoadInit() {
        await UIBundleMgr.loadBundlePackage(UIFrameConfig.INIT_LOAD_PKGS);
    }

    /** 初始化全屏遮罩组件 */
    async initFullMask(UIID: number) {
        return new Promise((resolve, reject) => {
            //获取UI注册信息
            let uiRegisterInfo = UIRegister.getUIInfo(UIID);
            if (!uiRegisterInfo) {
                console.error("全屏遮罩初始化失败，UIID:${UIID} 未注册UI信息");
                return;
            }
            if (uiRegisterInfo.UIType != UIType.Panel) {
                console.error("全屏遮罩初始化失败，UIID:${UIID} 不是面板类型");
                return;
            }
            if (uiRegisterInfo.UILayer != UILayer.FullScreenMask) {
                console.error("全屏遮罩初始化失败，UIID:${UIID} 不是全屏遮罩层级");
                return;
            }
            this.open({
                UIID: UIID,
                openCall: () => {
                    this.fullMaskUI = this.getUIInstance(UIID) as UIFullMask;
                    this.fullMaskUI.m_ui.visible = false;
                    this.openUIs.splice(this.openUIs.indexOf(this.fullMaskUI), 1);
                    resolve(true);
                }
            })
        })
    }

    bindPopupMaskCreateFunc(func: () => fgui.GComponent) {
        this.popupMaskCreateFunc = func;
    }


    /**
     * 打开ui
     * @param UIID id
     * @param data 打开参数
     * @param openCall open回调
     * @param closeCall close回调
     * @param errorCall 打开失败回调
     * @returns 
     */
    async open(param: OpenUIparam) {
        let UIRegisterInfo = UIRegister.getUIInfo(param.UIID);
        if (this.openings.indexOf(param.UIID) >= 0) {
            console.warn(`ui ${param.UIID} is opening`);
            return;
        }
        if (UIRegisterInfo.UIType == UIType.Popup && !param.popuoQueueOpen) {
            //该弹窗不是通过弹窗队列打开的
            console.warn(`ui ${param.UIID} is not popup queue open`);
            return;
        }
        if (this.openUIs.find(ui => ui.UIID == param.UIID)) {
            if (param.reOpen) {
                this.close(param.UIID);
            } else {
                console.warn(`ui ${param.UIID} is open`);
                return;
            }
        }
        this.openings.push(param.UIID);
        this.setFullScreenMaskPanelVisible(true);
        //加载依赖
        let isLoadSccess = await UIBundleMgr.loadBundlePackage(UIRegisterInfo.uiPackage);
        if (!isLoadSccess) {
            console.log(`ui ${param.UIID} load package failed`);
            this.setFullScreenMaskPanelVisible(false);
            return;
        }

        let ui = new UIRegisterInfo._class() as UIBase;
        let openSuccess = ui.open(param);
        if (openSuccess) {
            this.openUIs.push(ui);
            this.openings.splice(this.openings.indexOf(param.UIID), 1);
            ui.opened();
            let layer = this.getUILayer(UIRegisterInfo.UILayer);
            layer.addChild(ui.m_ui);
        } else {
            console.error(`ui ${param.UIID} open failed`);
            this.openings.splice(this.openings.indexOf(param.UIID), 1);
            if (param.errorCall) param.errorCall();
        }
        this.setFullScreenMaskPanelVisible(false);
    }

    /** 打开ui实例,作用只是显示并添加到打开列表，并执行openSuccess */
    openUIIns(ui: UIBase) {
        if (!ui || ui.isDisposed) return;
        this.openUIs.push(ui);
        ui.show();
        this.concealUIs.splice(this.concealUIs.indexOf(ui), 1);
    }

    /** 获取ui实例 */
    getUIInstance(UIID: number): UIBase {
        //@ts-ignore
        return this.openUIs.find(ui => ui.UIID == UIID);
    }

    /**
     * 关闭ui
     * @param UIID 
     * @param dispose 是否销毁，销毁才会执行closeCall，不销毁只是隐藏且从打开列表中移除
     */
    close(UIID: number, dispose: boolean = true) {
        let uiins = this.openUIs.find(ui => ui.UIID == UIID);
        if (uiins && !uiins.isDisposed) {
            this.openUIs.splice(this.openUIs.indexOf(uiins), 1);
            if (dispose) {
                uiins.allowClose = true;
                uiins.close();
            }
            else {
                uiins.hide();
                this.concealUIs.push(uiins);
            }
        } else {
            console.warn(`ui close error ${UIID} not found or disposed`);
        }
    }

    /**
     *  关闭所有
     * @param exclude 不需要关闭的UI
     */
    closeAll(exclude: number[] = []) {
        let uiArr = this.openUIs.filter(ui => exclude.indexOf(ui.UIID) == -1);
        for (let i = 0; i < uiArr.length; i++) {
            const element = uiArr[i];
            this.close(element.UIID);
        }
    }

    /** 获取ui层级实例 */
    getUILayer(layer: UILayer): fgui.GComponent {
        //@ts-ignore
        return this.uiLayerMap[layer];
    }



    /** 设置全屏遮罩 */
    setFullScreenMaskPanelVisible(visible: boolean) {
        if (this.fullMaskUI) this.fullMaskUI.setMaskVisible(visible);
    }


    /** 获取当前正在打开的界面(包含加载中) */
    getOpenings() {
        return this.openings.length > 0 ? this.openings : null;
    }

    /** 获取当前最上层打开的弹窗,(不包含加载中) */
    getCurTopPopup() {
        //@ts-ignore
        let curPopup: UIBase = null;
        this.openUIs.forEach(ui => {
            if (ui.UIRegisterInfo.UIType == UIType.Popup) {
                curPopup = ui;
            }
        })
        return curPopup;
    }

    /** 获取当前打开的所有弹窗 */
    getCurPopupAll() {
        return this.openUIs.filter(ui => ui.UIRegisterInfo.UIType == UIType.Popup) as UIPopup[];
    }

    /** 刷新弹窗遮罩，只有最上层弹窗有遮罩 */
    refreshPopupMask() {
        let popAll = this.getCurPopupAll();
        popAll.forEach((ui, index) => {
            if (index < popAll.length - 1 && ui.popupMask) ui.popupMask.visible = false;
            else if (index == popAll.length - 1 && ui.popupMask) ui.popupMask.visible = true;
        })
    }

    /** 获取当前打开的最上层全屏界面，(不包含加载中) */
    getCurTopPanel() {
        //@ts-ignore
        let curPanel: UIPanel = null;
        this.openUIs.forEach(ui => {
            if (ui.UIRegisterInfo.UIType == UIType.Panel) curPanel = ui as UIPanel;
        })
        return curPanel
    }

    registerUI(info: UIRegisterInfo) {
        UIRegister.register(info);
    }
}
(window as any).UIFrame = UIFrame;
