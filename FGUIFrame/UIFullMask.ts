/** 全屏遮罩基类 */
class UIFullMask extends UIPanel {

    visibleCount: number = 0;

    setMaskVisible(visible: boolean) {
        if (visible) {
            this.visibleCount++;
        } else {
            this.visibleCount--;
        }
        if (this.visibleCount > 0) {
            this.setShow();
        } else {
            this.setHide();
        }
    }

    protected setShow() {
        if (this.m_ui.visible == true) return;
        this.m_ui.visible = true;
    }

    protected setHide() {
        if (this.m_ui.visible == false) return;
        this.m_ui.visible = false;
    }
}
window["UIFullMask"] = UIFullMask;