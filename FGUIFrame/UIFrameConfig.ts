class UIFrameConfig {
    /** 设计分辨率 */
    public static FRAME_WIDTH = 750;
    public static FRAME_HEIGHT = 1334;
    /** 初始化加载包 */
    public static INIT_LOAD_PKGS = ["Common"];
    /** 常驻内存包 */
    public static PERMANENT_PKGS = ["Common"];
    /** 最大包数量-不包含常驻 */
    public static MAX_PKGS = 5;
    /** 弹窗遮罩透明度 */
    public static POPUP_MASK_ALPHA = 0.6;

    /** 初始化配置 */
    public static init(config: {
        FRAME_WIDTH?: number;
        FRAME_HEIGHT?: number;
        INIT_LOAD_PKGS?: string[];
        PERMANENT_PKGS?: string[];
        MAX_PKGS?: number;
        POPUP_MASK_ALPHA?: number;
    }) {
        if (config.FRAME_WIDTH) this.FRAME_WIDTH = config.FRAME_WIDTH;
        if (config.FRAME_HEIGHT) this.FRAME_HEIGHT = config.FRAME_HEIGHT;
        if (config.INIT_LOAD_PKGS) this.INIT_LOAD_PKGS = config.INIT_LOAD_PKGS;
        if (config.PERMANENT_PKGS) this.PERMANENT_PKGS = config.PERMANENT_PKGS;
        if (config.MAX_PKGS) this.MAX_PKGS = config.MAX_PKGS;
        if (config.POPUP_MASK_ALPHA) this.POPUP_MASK_ALPHA = config.POPUP_MASK_ALPHA;
    }
}
window["UIFrameConfig"] = UIFrameConfig;
