import { Asset, assetManager, game, resources, sys } from "cc";
import * as fgui from "fairygui-cc";
const jsb = (<any>window).jsb;
export class LoadPanel {

    private static bundleName: string = "Load";
    private static panelName: string = "LoadPanel";

    static show() {
        //加载bundle
        assetManager.loadBundle(this.bundleName, (err, bundle) => {
            if (err) {
                console.log(err);
                return;
            }
            //载入pkg
            fgui.UIPackage.loadPackage(bundle, this.bundleName, (err, pkg) => {
                if (err) {
                    console.log("加载package失败", this.bundleName);
                    return;
                }
                //显示panel
                let panel = fgui.UIPackage.createObject(this.bundleName, this.panelName) as fgui.GComponent;
                fgui.GRoot.inst.addChild(panel);
                panel.makeFullScreen();
                new LoadPanel(panel);
            })
        })
    }

    ui: fgui.GComponent;

    private _am: jsb.AssetsManager = null!;
    private _storagePath: string = null!;
    private versionCompareHandle: (versionA: string, versionB: string) => number = null!;

    constructor(ui: fgui.GComponent) {
        this.ui = ui;
        console.log("LoadPanel open ok");

        if (sys.isNative) {
            this.checkHotUpdate();
        }
    }

    async checkHotUpdate() {
        console.log("开始检查热更新");
        console.log("开始加载project.manifest");
        // 设置您自己的版本比较处理程序，versionA 和 B 是字符串形式的版本
        // 如果返回值大于 0，则 versionA 大于 B，
        // 如果返回值等于 0，则 versionA 等于 B，
        // 如果返回值小于 0，则 versionA 小于 B。
        this.versionCompareHandle = function (versionA: string, versionB: string) {
            console.log("JS 自定义版本比较：version A is " + versionA + ', version B is ' + versionB);
            var vA = versionA.split('.');
            var vB = versionB.split('.');
            for (var i = 0; i < vA.length; ++i) {
                var a = parseInt(vA[i]);
                var b = parseInt(vB[i] || '0');
                if (a === b) {
                    continue;
                }
                else {
                    return a - b;
                }
            }
            if (vB.length > vA.length) {
                return -1;
            }
            else {
                return 0;
            }
        };
        this._storagePath = ((jsb.fileUtils ? jsb.fileUtils.getWritablePath() : '/') + 'blackjack-remote-asset');
        console.log('远程资产的存储路径：' + this._storagePath);
        this._am = new jsb.AssetsManager('', this._storagePath, this.versionCompareHandle);

        // 设置验证回调函数，但目前我们还没有 MD5 校验函数，所以仅打印一些消息
        // 如果验证通过则返回 true，否则返回 false
        this._am.setVerifyCallback(function (path: string, asset: any) {
            // 当资产被压缩时，我们无需再检查其 MD5 值，因为压缩文件已被删除。
            var compressed = asset.compressed;
            // 获取正确的 md5 值。
            var expectedMD5 = asset.md5;
            // 资产的路径是相对路径，而路径本身是绝对路径。
            var relativePath = asset.path;
            // 资产文件的大小，但此值可能不存在。
            var size = asset.size;
            if (compressed) {
                let str = "验证通过 : " + relativePath;
                console.log(str);

                return true;
            }
            else {
                let str = "验证通过 : " + relativePath + ' (' + expectedMD5 + ')';
                return true;
            }
        });

        let manifestUrl: string = await new Promise((resolve, reject) => {
            resources.load('project', (err, manifest: Asset) => {
                if (!err) {
                    resolve(manifest.nativeUrl);
                } else {
                    console.log(" 加载 project.manifest 失败", err);
                    resolve('');
                }
            })
        })
        if (!manifestUrl) {
            return;
        }

        //加载本地manifest
        this._am.loadLocalManifest(manifestUrl);

        //判断本地manifest是否加载
        if (!this._am.getLocalManifest() || !this._am.getLocalManifest().isLoaded()) {
            console.log("加载本地manifest失败");
            return;
        }

        //开始检查版本更新
        let needUpdate = await new Promise((resolve, reject) => {
            let checkCb = (event: any) => {
                console.log('Code: ' + event.getEventCode());
                switch (event.getEventCode()) {
                    case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                        console.log('未找到本地的配置文件，因此热更新被跳过。');
                        resolve(false);
                        break;
                    case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
                    case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                        console.log('无法下载清单文件，因此热更新被跳过。');
                        resolve(false);
                        break;
                    case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                        console.log('已经更新至最新的远程版本了。');
                        break;
                    case jsb.EventAssetsManager.NEW_VERSION_FOUND:
                        console.log('新版本已找到，请尝试进行更新。. (' + Math.ceil(this._am.getTotalBytes() / 1024) + 'kb)');
                        resolve(true);
                        break;
                    default:
                        return;
                }
                this._am.setEventCallback(null!);
            }
            this._am.setEventCallback((e) => {
                checkCb(e);
            });
            this._am.checkUpdate();
        })

        console.log("检查完成：", needUpdate);

        if (needUpdate) {
            console.log("开始热更新");
            
            await new Promise((resolve, reject) => {
                let updateCb = (event: any) => {
                    var needRestart = false;
                    var failed = false;
                    switch (event.getEventCode()) {
                        case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                            console.log('未找到本地的配置文件，因此热更新被跳过。....');
                            failed = true;
                            break;
                        case jsb.EventAssetsManager.UPDATE_PROGRESSION:
                            var msg = event.getMessage();
                            if (msg) {
                                console.log('已下载文件大小：' + msg);
                            }
                            break;
                        case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
                        case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                            console.log('无法下载清单文件，因此热更新被跳过。');
                            failed = true;
                            break;
                        case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                            console.log('已经更新至最新的远程版本了。');
                            failed = true;
                            break;
                        case jsb.EventAssetsManager.UPDATE_FINISHED:
                            console.log('更新完成。' + event.getMessage());
                            needRestart = true;
                            break;
                        case jsb.EventAssetsManager.UPDATE_FAILED:
                            console.log('更新失败。' + event.getMessage());;
                            break;
                        case jsb.EventAssetsManager.ERROR_UPDATING:
                            console.log('更新错误：' + event.getAssetId() + ', ' + event.getMessage());
                            break;
                        case jsb.EventAssetsManager.ERROR_DECOMPRESS:
                            console.log('解压错误：' + event.getAssetId() + ', ' + event.getMessage());
                            break;
                        default:
                            break;
                    }

                    if (failed) {
                        this._am.setEventCallback(null!);
                        resolve(false);
                    }

                    if (needRestart) {
                        this._am.setEventCallback(null!);
                        // 将清单的搜索路径添加到开头
                        var searchPaths = jsb.fileUtils.getSearchPaths();
                        var newPaths = this._am.getLocalManifest().getSearchPaths();
                        console.log(JSON.stringify(newPaths));
                        Array.prototype.unshift.apply(searchPaths, newPaths);
                        // 在游戏启动时，此值将被获取并附加到默认搜索路径中，
                        // 有关详细使用方法，请参考示例文件/js-tests/main.js。
                        // !!！ 在 main.js 中重新添加搜索路径非常重要，否则新的脚本将无法生效。
                        localStorage.setItem('HotUpdateSearchPaths', JSON.stringify(searchPaths));
                        jsb.fileUtils.setSearchPaths(searchPaths);

                        // restart game.
                        setTimeout(() => {
                            game.restart();
                        }, 1000)
                    }
                }
                this._am.setEventCallback((e) => {
                    updateCb(e);
                });
                this._am.update();
            })
        }
    }

}