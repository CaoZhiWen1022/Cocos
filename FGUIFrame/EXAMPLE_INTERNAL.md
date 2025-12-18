# 如何标记类不导出到 d.ts

## 方法 1：使用 `@internal` JSDoc 标签（推荐）

在类、接口、类型或函数上添加 `/** @internal */` 标签，配合 `tsconfig.json` 中的 `"stripInternal": true` 选项。

### 示例：

```typescript
/**
 * 这个类不会出现在 d.ts 文件中
 * @internal
 */
class InternalClass {
    // ...
}

/**
 * 普通类，会出现在 d.ts 中
 */
class PublicClass {
    // ...
}
```

### tsconfig.json 配置：

```json
{
  "compilerOptions": {
    "declaration": true,
    "stripInternal": true  // 启用后，@internal 标记的内容不会出现在 d.ts 中
  }
}
```

## 方法 2：从 tsconfig.json 的 include 中排除文件

如果整个文件都不需要导出，可以从 `include` 中移除：

```json
{
  "include": [
    "./UIFrameConfig.ts",
    // "./InternalFile.ts",  // 注释掉或删除，就不会编译到 d.ts
  ]
}
```

## 方法 3：使用 exclude 排除文件

```json
{
  "exclude": [
    "node_modules",
    "dist",
    "./InternalFile.ts"  // 排除特定文件
  ]
}
```

## 注意事项

1. `@internal` 标签需要配合 `stripInternal: true` 才能生效
2. `@internal` 标记的类在 JavaScript 中仍然存在，只是不会出现在类型声明文件中
3. 如果只想隐藏某些方法或属性，也可以对它们使用 `@internal`

