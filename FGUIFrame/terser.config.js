module.exports = {
    compress: {
        // 压缩选项
        drop_console: false,        // 是否移除 console
        drop_debugger: true,        // 移除 debugger
        pure_funcs: [],             // 移除指定函数调用（如 ['console.log']）
        passes: 2,                  // 压缩次数，多次压缩可以获得更好的压缩效果
        unsafe: false,              // 启用不安全的优化
        unsafe_comps: false,        // 不安全的比较优化
        unsafe_math: false,         // 不安全的数学优化
        unsafe_methods: false,      // 不安全的方法调用优化
        unsafe_proto: false,        // 不安全的原型优化
        unsafe_regexp: false,       // 不安全的正则优化
        unsafe_undefined: false,    // 不安全的 undefined 优化
        warnings: false,            // 是否显示警告
    },
    mangle: {
        // 混淆选项
        toplevel: false,            // 混淆顶级作用域
        eval: false,                // 混淆 eval 中的代码
        keep_classnames: false,    // 保留类名（设为 true 则不混淆类名）
        keep_fnames: false,        // 保留函数名（设为 true 则不混淆函数名）
        properties: {
            regex: /^_/             // 只混淆以下划线开头的属性
        }
    },
    format: {
        // 格式化选项
        comments: false,            // 移除注释
        beautify: false,            // 不美化代码
        preserve_annotations: false // 不保留注释
    },
    sourceMap: false                // 不生成 source map
};

