
class UIPopup extends UIBase {

    /** 是否显示遮罩 */
    showMask: boolean = true;
    /** 是否点击遮罩关闭 */
    isMaskClickCloseThis: boolean = true;

    //@ts-ignore
    popupMask: fgui.GComponent;

    /** 是否开启动画，默认开启，会修改弹窗锚点 */
    isOpenAni: boolean = true;

    thisHideOtherPopup: UIPopup[] = [];
    resize(): void {
        //居中适配 
        let x = fgui.GRoot.inst.width / 2 - this.m_ui.width / 2;
        let y = fgui.GRoot.inst.height / 2 - this.m_ui.height / 2;
        this.m_ui.setPosition(x, y);
    }

    opened(): void {
        super.opened();
        this.initMask()
        this.openAni();
        this.hideOtherPopup();
        (window as any)["GameFrame"].ins.uiFrame.refreshPopupMask();
    }

    openAni(): void {
        if (this.isOpenAni) {
            this.m_ui.setPivot(0.5, 0.5);
            // this.m_ui.alpha = 0.6;
            this.m_ui.setScale(0.3, 0.3);

            cc.tween(this.m_ui).to(0.1, { scaleX: 1, scaleY: 1 }).start();
        }
    }

    initMask(): void {
        if (this.showMask && !this.popupMask) {
            if (!(window as any)["GameFrame"].ins.uiFrame.popupMaskCreateFunc) {
                console.error("弹窗背景组件创建方法未绑定");
                console.error("使用GameFrame.ins.uiFrame.bindPopupMaskCreateFunc绑定弹窗背景组件创建方法");
                return;
            }
            this.popupMask = (window as any)["GameFrame"].ins.uiFrame.popupMaskCreateFunc();
            this.popupMask.makeFullScreen();
            this.popupMask.x = 0;
            this.popupMask.y = 0;
            this.popupMask.alpha = UIFrameConfig.POPUP_MASK_ALPHA;
            (window as any)["GameFrame"].ins.uiFrame.getUILayer(UILayer.popupLayer).addChild(this.popupMask);
            if (this.isMaskClickCloseThis) {
                this.popupMask.onClick(() => {
                    this.closeThis();
                }, this);
            }
        }
        if (this.popupMask) this.popupMask.visible = true;
        window["popupMask"] = this.popupMask
    }

    closeed(): void {
        super.closeed();
        this.popupMask?.dispose();
        this.showThisHideOtherPopup();
        (window as any)["GameFrame"].ins.uiFrame.refreshPopupMask();
    }

    hide(): void {
        super.hide();
        if (this.popupMask) this.popupMask.visible = false;
        (window as any)["GameFrame"].ins.uiFrame.refreshPopupMask();
    }

    private hideOtherPopup(): void {
        //关闭其他弹窗
        let allPopup = (window as any)["GameFrame"].ins.uiFrame.getCurPopupAll();
        for (let i = 0; i < allPopup.length; i++) {
            const element = allPopup[i];
            if (element != this) {
                let isclose = false
                if (this.UIRegisterInfo.isSamePriorityMeanwhileOpen) {
                    if (element.UIRegisterInfo.popupPriority != this.UIRegisterInfo.popupPriority) {
                        isclose = true;
                    }
                } else {
                    isclose = true;
                }
                if (isclose) {
                    (window as any)["GameFrame"].ins.uiFrame.close(element.UIID, false);
                    this.thisHideOtherPopup.push(element);
                }
            }
        }
    }

    private showThisHideOtherPopup(): void {
        for (let i = 0; i < this.thisHideOtherPopup.length; i++) {
            const element = this.thisHideOtherPopup[i];
            (window as any)["GameFrame"].ins.uiFrame.openUIIns(element);
        }
        this.thisHideOtherPopup.length = 0;
    }
}
(window as any).UIPopup = UIPopup;
