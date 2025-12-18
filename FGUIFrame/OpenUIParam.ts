type OpenUIparam = {
    UIID: number;
    /** 参数 */
    data?: any;
    /** 打开回调 只执行一次 */
    openCall?: Function;
    /** 关闭回调 */
    closeCall?: Function;
    /** 打开失败回调 */
    errorCall?: Function;
    /** 已打开状态下是否重新打开 */
    reOpen?: boolean;
    /** 标记为弹窗队列打开 */
    popuoQueueOpen?: boolean;
}
