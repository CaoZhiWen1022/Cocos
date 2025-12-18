
/**
 * 游戏框架主类
 */
class GameFrame {
    private static _ins: GameFrame;
    public static get ins(): GameFrame {
        if (!this._ins) {
            this._ins = new GameFrame();
        }
        return this._ins;
    }
    uiFrame!: UIFrame;
    timerMgr!: TimerMgr;

    /** 框架初始化 */
    init() {
        console.log("GameFrame Init");
        this.uiFrame = new UIFrame();
        this.uiFrame.gameLaunchInit();
        console.log("uiFrame Init");

        this.timerMgr = new TimerMgr();
        this.timerMgr.init();
        console.log("timerMgr Init");
    }
}

(window as any).GameFrame = GameFrame;
