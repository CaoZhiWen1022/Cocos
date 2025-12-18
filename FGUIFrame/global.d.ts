// Cocos Creator 类型声明
declare namespace cc {
    class Component {
        schedule(callback: Function, interval: number): void;
        scheduleOnce(callback: Function, delay: number): void;
        unschedule(callback: Function): void;
    }
    class Node {
        constructor(name?: string);
        addComponent<T extends Component>(component: { new(): T }): T;
    }
    class Tween<T> {
        static stopAllByTarget(target: any): void;
    }
    function tween<T>(target: T): {
        to(duration: number, props: Partial<T>): { start(): void };
    };
    namespace director {
        function getScene(): any;
        function addPersistRootNode(node: Node): void;
    }
    namespace AssetManager {
        const instance: {
            removeBundle(bundle: any): unknown;
            loadBundle(name: string, callback: (err: any, bundle: any) => void): void;
            getBundle(name: string): any;
        };
        class Bundle {
load
        }
    }
}

// FairyGUI 类型声明
declare namespace fgui {
    class GComponent {
        name: string;
        x: number;
        y: number;
        width: number;
        height: number;
        scaleX: number;
        scaleY: number;
        alpha: number;
        visible: boolean;
        isDisposed: boolean;
        addChild(child: GComponent): void;
        makeFullScreen(): void;
        setPosition(x: number, y: number): void;
        setScale(x: number, y: number): void;
        setPivot(x: number, y: number): void;
        dispose(): void;
        onClick(callback: Function, context?: any): void;
    }
    class GRoot {
        static create(): void;
        static inst: GRoot;
        width: number;
        height: number;
        addChild(child: GComponent): void;
    }
    class UIPackage {
        static removePackage(pkgName: any) {
            throw new Error("Method not implemented.");
        }
        static loadPackage(bundle: any, name: string, callback: (err: any, pkg: any) => void): void;
    }
}

// Window 扩展
interface Window {
    GameFrame: any;
}

