class UIBundleMgr {

    /** 加载完成的bundle */
    private static m_loadedBundles: string[] = [];
    /** 加载中的bundle */
    private static m_loadingBundles: string[] = [];
    /** 加载完成的package */
    private static m_loadedPackage: string[] = [];
    /** 加载中的package */
    private static m_loadingPackage: string[] = [];

    /** 包的引用计数 */
    private static refCountMap: Map<string, number> = new Map();

    /** 加载bundlePackage */
    public static async loadBundlePackage(bundleNames: string[]): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            let results: boolean[] = [];
            let check = () => {
                if (results.length == bundleNames.length) {
                    if (results.every(result => result)) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            };
            bundleNames.forEach(async (bundleName) => {
                let isLoadBundleSuccess = await this._loadBundle(bundleName);
                let isLoadPackageSuccess = await this._loadPackage(bundleName);
                if (!isLoadBundleSuccess || !isLoadPackageSuccess) {
                    results.push(false);
                } else {
                    results.push(true);
                }
                check();
            })
        });
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

    /** 加载package */
    private static _loadPackage(packageName: string) {
        return new Promise(async (resolve, reject) => {
            if (this.m_loadingPackage.indexOf(packageName) != -1) {//其他模块已经触发了该package的加载，等待加载完成
                do {
                    await new Promise(resolve => setTimeout(resolve, 100));
                } while (this.m_loadingPackage.indexOf(packageName) != -1);
                if (this.m_loadedPackage.indexOf(packageName) == -1) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            } else {
                if (this.m_loadedPackage.indexOf(packageName) == -1) {
                    let bundle = cc.AssetManager.instance.getBundle(packageName);
                    if (!bundle) resolve(false);
                    else {
                        this.m_loadingPackage.push(packageName);
                        fgui.UIPackage.loadPackage(bundle, packageName, (err: any, pkg: any) => {
                            if (err) {
                                console.log("加载package失败" + packageName);
                                this.m_loadingPackage.splice(this.m_loadingPackage.indexOf(packageName), 1);
                                resolve(false);
                            } else {
                                this.m_loadedPackage.push(packageName);
                                this.m_loadingPackage.splice(this.m_loadingPackage.indexOf(packageName), 1);
                                resolve(true);
                            }
                        })
                    }
                } else {
                    resolve(true);
                }
            }
        })
    }

    public static addRefCount(packageNames: string[]) {
        packageNames.forEach(packageName => {
            if (this.refCountMap.has(packageName)) {
                this.refCountMap.set(packageName, this.refCountMap.get(packageName) + 1);
            } else {
                this.refCountMap.set(packageName, 1);
            }
        });
    }

    public static removeRefCount(packageNames: string[]) {
        packageNames.forEach(packageName => {
            if (this.refCountMap.has(packageName)) {
                let count = this.refCountMap.get(packageName);
                let newCount = count - 1;
                this.refCountMap.set(packageName, newCount);
            }
        });
        this.checkAllowUnloadPackage();
    }

    /** 检查是允许卸载的包 */
    private static checkAllowUnloadPackage() {
        let max = UIFrameConfig.MAX_PKGS + UIFrameConfig.PERMANENT_PKGS.length;
        //卸载引用计数为0的非常驻包
        this.refCountMap.forEach((count, packageName) => {
            if (this.m_loadedPackage.length <= max) return;
            if (count == 0 && UIFrameConfig.PERMANENT_PKGS.indexOf(packageName) == -1) {
                this.unBundlePackage(packageName);
                this.refCountMap.delete(packageName);
            }
        });
    }

    /** 卸载包 */
    private static unBundlePackage(packageName: string) {
        //先卸载bundle
        if (this.m_loadedBundles.indexOf(packageName) != -1) {
            let bundle = cc.AssetManager.instance.getBundle(packageName);
            if (bundle) {
                bundle.releaseAll();
                cc.AssetManager.instance.removeBundle(bundle);
                this.m_loadedBundles.splice(this.m_loadedBundles.indexOf(packageName), 1);
            }
        }
        //再卸载package
        if (this.m_loadedPackage.indexOf(packageName) != -1) {
            fgui.UIPackage.removePackage(packageName);
            this.m_loadedPackage.splice(this.m_loadedPackage.indexOf(packageName), 1);
        }
    }
}
(window as any).UIBundleMgr = UIBundleMgr;
