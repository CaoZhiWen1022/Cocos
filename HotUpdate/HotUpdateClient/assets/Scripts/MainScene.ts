import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;
import * as fgui from 'fairygui-cc';
import { LoadPanel } from './LoadPanel';

@ccclass('MainScene')
export class MainScene extends Component {
    start() {

        console.log("热更新测试");
        

        //加载初始化fgui
        fgui.GRoot.create();

        LoadPanel.show();
    }
}


