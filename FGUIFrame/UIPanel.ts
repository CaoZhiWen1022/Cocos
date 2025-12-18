
class UIPanel extends UIBase {

    opened(): void {
        super.opened();

    }


    startLoad() {
        //预加载home包资源
    }

}
(window as any).UIPanel = UIPanel;
