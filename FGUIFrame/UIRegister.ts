type UIRegisterInfo = {
    /** uiid */
    UIID: number;

    /** 创建实例 */
    createInstance(): fgui.GComponent;

    /** ui脚本 */
    _class: any;

    /** ui类型 */
    UIType: UIType;

    /** ui层级 */
    UILayer: UILayer;

    /** ui包依赖 */
    uiPackage: string[];

    /** 其他资源依赖 */
    uiRes: string[];

    /** 是否允许和同权重的弹窗同时打开 */
    isSamePriorityMeanwhileOpen?: boolean
    /** 弹窗权重 */
    popupPriority?: PopupPriority;
    /** 弹窗的依赖Panel,存在依赖界面才打开 */
    popupDependPanel?: number[];
    /** 弹窗超时时间，等不到依赖界面时多久清理 */
    popupTimeout?: number;
}
/** @internal */
class UIRegister {

    public static ALLUIINFO: UIRegisterInfo[] = [];

    public static register(info: UIRegisterInfo) {
        if (this.getUIInfo(info.UIID)) {
            console.error(`uiID:${info.UIID} 已注册`);
            return;
        }
        this.ALLUIINFO.push(info);
    }


    public static getUIInfo(uiID: number): UIRegisterInfo {
        //@ts-ignore
        return this.ALLUIINFO.find(info => info.UIID == uiID);
    }
}
