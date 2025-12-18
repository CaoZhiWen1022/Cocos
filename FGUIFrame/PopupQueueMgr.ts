class PopupQueueMgr {

    private queue: OpenUIparam[] = [];

    //@ts-ignore
    private curPopup: UIBase = null;

    /** 入队 */
    push(param: OpenUIparam) {
        if (this.queue.find(p => p.UIID == param.UIID)) {
            //弹窗已经在队列
            console.warn(`ui ${param.UIID} already in queue`);
        }
        else if ((window as any)["GameFrame"].ins.uiFrame.getCurPopupAll().find((ui: UIBase) => ui.UIID == param.UIID)) {
            //弹窗已打开
            console.warn(`ui ${param.UIID} already open`);
        }
        let registerInfo = UIRegister.getUIInfo(param.UIID);
        if (!registerInfo) {
            //弹窗未注册
            console.warn(`ui ${param.UIID} not register`);
            return;
        }
        if (registerInfo.UIType != UIType.Popup || !registerInfo.popupPriority) {
            //弹窗注册信息不正确
            console.warn(`ui ${param.UIID} popup register error`);
            return;
        }
        console.log(`ui ${param.UIID} push queue`);
        this.queue.push(param);
        this.checkQueue();
    }

    /** 检查 */
    public checkQueue() {
        if (this.queue.length == 0) return;
        if ((window as any)["GameFrame"].ins.uiFrame.getOpenings()) return//如果有界面正在打开，则return
        //队列进行排队
        //@ts-ignore
        this.queue.sort((a, b) => UIRegister.getUIInfo(b.UIID).popupPriority - UIRegister.getUIInfo(a.UIID).popupPriority);
        let target: OpenUIparam;
        let targetInfo: UIRegisterInfo;
        for (let i = 0; i < this.queue.length; i++) {//找到一个可以打开的弹窗
            const popup = this.queue[i];
            let popupInfo = UIRegister.getUIInfo(popup.UIID);
            let curPanel = (window as any)["GameFrame"].ins.uiFrame.getCurTopPanel();
            let curPopupPriority = (window as any)["GameFrame"].ins.uiFrame.getCurTopPopup() ? (window as any)["GameFrame"].ins.uiFrame.getCurTopPopup().UIRegisterInfo.popupPriority : -1;
            //@ts-ignore
            if (popupInfo.popupPriority > curPopupPriority
                && (!popupInfo.popupDependPanel || popupInfo.popupDependPanel.length == 0 || popupInfo.popupDependPanel.indexOf(curPanel.UIID) >= 0)
                || (popupInfo.popupPriority == curPopupPriority && popupInfo.isSamePriorityMeanwhileOpen)) {
                target = popup;
                targetInfo = popupInfo;
                break;
            }
        }
        //@ts-ignore
        if (target) this.show(target);
    }

    private show(param: OpenUIparam) {
        param.popuoQueueOpen = true;
        (window as any)["GameFrame"].ins.uiFrame.open(param);
        this.queue.splice(this.queue.indexOf(param), 1);
    }
}
