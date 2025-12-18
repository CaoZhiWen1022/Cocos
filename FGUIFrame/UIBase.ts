
class UIBase {

    allowClose: boolean = false;
    //@ts-ignore
    UIRegisterInfo: UIRegisterInfo;
    UIID: number = -1;
    //@ts-ignore
    openParam: OpenUIparam;
    //@ts-ignore
    m_ui: fgui.GComponent;
    data: any;

    get isDisposed(): boolean {
        return this.m_ui.isDisposed;
    }

    /** 打开 */
    open(openParam: OpenUIparam): boolean {
        this.UIID = openParam.UIID;
        this.openParam = openParam;
        this.data = openParam.data;
        this.UIRegisterInfo = UIRegister.getUIInfo(openParam.UIID);
        this.m_ui = this.UIRegisterInfo.createInstance();
        this.m_ui.name = this.constructor.name;
        if (!this.m_ui) {
            console.error(`ui ${this.UIID} not found`);
            return false;
        }
        return true;
    }

    /** 适配 */
    resize(): void {
        this.m_ui.makeFullScreen();
    }

    /** 打开成功，仅首次打开执行 */
    opened(): void {
        if (this.openParam.openCall) {
            this.openParam.openCall();
            this.openParam.openCall = undefined;
        }
        this.resize();
        this.showed();
        (window as any).GameFrame.ins.uiFrame.popupQueueMgr.checkQueue();
        //增加包体引用计数
        UIBundleMgr.addRefCount(this.UIRegisterInfo.uiPackage);
    }

    /** 关闭-此时UI已销毁 */
    close(): void {
        if (!this.allowClose) return;
        if (this.isDisposed) return;
        this.m_ui.dispose();
        this.closeed();
    }

    /** 关闭成功 */
    closeed(): void {
        if (this.openParam.closeCall) this.openParam.closeCall();
        cc.Tween.stopAllByTarget(this.m_ui);
        (window as any).GameFrame.ins.uiFrame.popupQueueMgr.checkQueue();
        //减少包体引用计数
        UIBundleMgr.removeRefCount(this.UIRegisterInfo.uiPackage);
    }

    /** 关闭自身 */
    closeThis() {
        (window as any)["GameFrame"].ins.uiFrame.close(this.UIID);
    }

    /** 隐藏 */
    hide(): void {
        this.m_ui.visible = false;
        this.hideed();
    }

    /** 隐藏成功 */
    hideed(): void {

    }

    /** 显示 */
    show(): void {
        this.m_ui.visible = true;
        this.showed();
    }

    /** 显示成功 */
    showed(): void {

    }
}
(window as any).UIBase = UIBase;
