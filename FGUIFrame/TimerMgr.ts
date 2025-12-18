class TimerMgr extends cc.Component {

    public init(): void {
        let timerMgrNode = new cc.Node("TimerMgr");
        cc.director.getScene().addChild(timerMgrNode);
        timerMgrNode.addComponent(TimerMgr);
        cc.director.addPersistRootNode(timerMgrNode);
    }

    //#region 基于时间的计时器
    funcList: { rawFun: Function, fun: Function, target: any }[] = []

    /**
     * 只执行一次 不支持匿名函数
     * @param delay 延迟时间：单位秒 传0下一帧执行
     * @param callback 回调方法
     * @param target 回调方法所属对象
     */
    once(delay: number, callback: Function, target: any): void {
        let funObj = {
            rawFun: callback,
            fun: () => {
                callback.bind(target)();
                this.funcList.splice(this.funcList.indexOf(funObj), 1);
            },
            target: target
        };
        this.funcList.push(funObj);
        this.scheduleOnce(funObj.fun, delay);
    }



    /**
     * 定时循环执行 不支持匿名函数
     * @param delay 间隔时间 
     * @param callback 回调函数
     * @param target 回调方法所属对象
     */
    loop(delay: number, callback: Function, target: any): void {
        let funObj = {
            rawFun: callback,
            fun: () => {
                callback.bind(target)();
            },
            target: target
        };
        this.funcList.push(funObj);
        this.schedule(funObj.fun, delay);
    }

    clear(callback: Function, target: any) {
        let funObj = this.funcList.find(v => v.rawFun.name == callback.name && v.target == target);
        if (funObj) {
            this.unschedule(funObj.fun);
            this.funcList.splice(this.funcList.indexOf(funObj), 1);
        }
    }

    clearAll(target: any) {
        for (let i = this.funcList.length - 1; i >= 0; i--) {
            if (this.funcList[i].target == target) {
                this.clear(this.funcList[i].rawFun, this.funcList[i].target);
            }
        }
    }
    //#endregion
}
(window as any).TimerMgr = TimerMgr;
