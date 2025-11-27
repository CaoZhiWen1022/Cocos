const chokidar = require('chokidar');
const path = require('path');
//cmd
const { exec } = require("child_process");

// 要监听的目录，默认为当前工作目录
const watchDir = process.cwd()+"/assets/"


// 初始化 watcher
const watcher = chokidar.watch(watchDir, {
    ignored: /(^|[\/\\])\../, // 忽略点文件
    persistent: true,
    ignoreInitial: true, // 忽略初始扫描的事件
    depth: 5 // 监听深度
});

// 定义事件处理函数
const log = console.log.bind(console);
let time = 0;
// 文件变化事件
watcher.on('change', (filePath) => {
    //排除meta文件变化
    if(filePath.indexOf(".meta") != -1) return;
    log(`文件已修改: ${path.relative(watchDir, filePath)}`);
    console.log("开始编译");
    
    if(Date.now() - time < 1000) return;
    time = Date.now();
    try {
        var cmd = exec("curl http://localhost:7456/update-db");//3.0 exec("curl http://localhost:7456/asset-db/refresh");
        cmd.on('exit', function (code, signal) {
            console.log("编译成功");
        })
        cmd.stdout.on('data', function (data) {
            console.log(data);
        })
    } catch (error) {
        console.log("编译失败", error);
    }
});

// 文件删除事件
watcher.on('unlink', (filePath) => {
    log(`文件已删除: ${path.relative(watchDir, filePath)}`);
});

// 错误事件
watcher.on('error', (error) => {
    log(`发生错误: ${error}`);
});

// 监听开始事件
watcher.on('ready', () => {
    log(`开始监听目录: ${watchDir}`);
});

// 监听关闭事件
watcher.on('close', () => {
    log('监听已停止');
});

// 处理程序退出
process.on('SIGINT', () => {
    watcher.close();
    process.exit();
});
