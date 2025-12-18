class GameBundleMgr {

    /** 加载完成的bundle */
    private static m_loadedBundles: string[] = [];
    /** 加载中的bundle */
    private static m_loadingBundles: string[] = [];

    /** 加载bundle资源 */
    public static async loadBundleRes(bundleName: string, resName: string) {
        await this._loadBundle(bundleName);
        let bundle = cc.AssetManager.instance.getBundle(bundleName);
        let res = await this._loadRes(bundle, resName);
        return res;
    }

    /** 加载bundle */
    private static _loadBundle(bundleName: string) {
        return new Promise(async (resolve, reject) => {
            if (this.m_loadingBundles.indexOf(bundleName) != -1) {//其他模块已经触发了该bundle的加载，等待加载完成
                do {
                    await new Promise(resolve => setTimeout(resolve, 100));
                } while (this.m_loadingBundles.indexOf(bundleName) != -1);
                if (this.m_loadedBundles.indexOf(bundleName) == -1) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            } else {
                if (this.m_loadedBundles.indexOf(bundleName) == -1) {
                    this.m_loadingBundles.push(bundleName);
                    cc.AssetManager.instance.loadBundle(bundleName, (err: any, bundle: any) => {
                        if (err) {
                            console.log("加载bundle失败", bundleName);
                            this.m_loadingBundles.splice(this.m_loadingBundles.indexOf(bundleName), 1);
                            resolve(false);
                        } else {
                            this.m_loadedBundles.push(bundleName);
                            this.m_loadingBundles.splice(this.m_loadingBundles.indexOf(bundleName), 1);
                            resolve(true);
                        }
                    })
                } else {
                    resolve(true);
                }
            }
        });
    }

    /** 加载资源 */
    private static _loadRes(bundle: any, url: string) {
        return new Promise((resolve, reject) => {
            if (!bundle) {
                resolve(null);
                return;
            }
            bundle.load(url, (err, res) => {
                if (err) {
                    console.log("加载bundle资源失败", url);
                    resolve(null);
                } else {
                    resolve(res);
                }
            });
        })
    }

    /** 卸载bundle */
    public static unloadBundle(bundleName: string) {
        if (this.m_loadedBundles.indexOf(bundleName) != -1) {
            let bundle = cc.AssetManager.instance.getBundle(bundleName);
            bundle.releaseAll();
            cc.AssetManager.instance.removeBundle(bundle);
            this.m_loadedBundles.splice(this.m_loadedBundles.indexOf(bundleName), 1);
        } else {
            console.log("要卸载的bundle不存在", bundleName);
        }
    }

    /** 释放bundle内的资源-但不释放bundle */
    public static release(bundleName: string, url: string) {
        let bundle = cc.AssetManager.instance.getBundle(bundleName);
        if (bundle) {
            bundle.release(url);
            console.log("释放资源", url);
        } else {
            console.log("要释放的bundle不存在", bundleName);
        }
    }
}
window["GameBundleMgr"] = GameBundleMgr;