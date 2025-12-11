#!/usr/bin/env node

/**
 * 配置表导出脚本
 * 用于命令行导出配置表，与编辑器逻辑保持一致
 * 
 * 使用方法：
 * node export-config.js --configDir <配置表目录> --annotationDir <标注目录> --jsonDir <JSON导出目录> [--scriptDir <脚本导出目录>]
 * 
 * 示例：
 * node export-config.js --configDir "./配置" --annotationDir "./配置/标注" --jsonDir "./配置/json" --scriptDir "./配置/ts"
 */

const path = require('path');
const fs = require('fs-extra');
const XLSX = require('xlsx');
const zlib = require('zlib');

// ==================== 辅助函数 ====================

function sanitizeNameSegment(name = '') {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function getAnnotationFilePath(annotationDir, fileName, sheetName) {
  const safeFile = sanitizeNameSegment(fileName || 'unknown');
  const safeSheet = sanitizeNameSegment(sheetName || 'sheet');
  return path.join(annotationDir, `${safeFile}__${safeSheet}.json`);
}

const XLSX_EXTENSIONS = new Set(['.xlsx']);

async function collectXlsxFiles(targetDir) {
  const result = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`读取目录失败: ${dir}`, error);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (XLSX_EXTENSIONS.has(ext)) {
          result.push(fullPath);
        }
      }
    }
  }

  await walk(targetDir);
  return result;
}

async function buildConfigStructure(configDir) {
  const files = await collectXlsxFiles(configDir);
  const structures = [];
  for (const filePath of files) {
    try {
      const workbook = XLSX.readFile(filePath, { cellDates: true });
      structures.push({
        absolutePath: filePath,
        relativePath: path.relative(configDir, filePath) || path.basename(filePath),
        fileName: path.basename(filePath),
        sheets: Array.isArray(workbook.SheetNames) ? workbook.SheetNames : []
      });
    } catch (error) {
      console.warn(`读取工作簿失败: ${filePath}`, error);
      structures.push({
        absolutePath: filePath,
        relativePath: path.relative(configDir, filePath) || path.basename(filePath),
        fileName: path.basename(filePath),
        sheets: [],
        error: error.message || '读取失败'
      });
    }
  }

  return structures;
}

function isEmptyValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return false;
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeHeaderValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function extractListTableData(sheet, fields) {
  if (!sheet || !sheet['!ref']) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true
  });

  if (rows.length < 2) return []; // 至少要有表头

  // 建立表头映射
  const headerRow = rows[0].map(normalizeHeaderValue);
  const headerMap = new Map();
  headerRow.forEach((name, index) => {
    if (name) headerMap.set(name, index);
  });

  const result = [];
  const dataRows = rows.slice(1);

  for (const row of dataRows) {
    const item = {};
    let hasValue = false;

    for (const field of fields) {
      const fieldName = field.name;
      const alias = field.alias || fieldName;
      const colIndex = headerMap.get(fieldName);

      if (colIndex === undefined) continue;

      let val = row[colIndex];

      // 类型转换
      if (field.type === 'number') {
        val = toNumber(val);
      } else {
        // string
        val = val === null || val === undefined ? null : String(val);
      }

      // 空值处理
      if (val === null && !field.nullable) {
        // 理论上校验阶段已拦截，这里为了导出安全，可以转为空串或0? 
        // 既然是强校验流程，这里保持 null 也可以，或者根据类型给默认值
        val = field.type === 'number' ? 0 : "";
      }

      item[alias] = val;

      // 简单的空行检查逻辑：只要有一个关键字段有值就算非空行？
      // 或者：只要不是所有字段都为空
      if (val !== null && val !== "" && val !== 0) {
        // 这是一个非常宽泛的判定
      }
    }
    result.push(item);
  }
  return result;
}

function extractConstantTableData(sheet, fields) {
  if (!sheet || !sheet['!ref']) return {};

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const firstCol = range.s.c;
  const valueCol = firstCol + 1;

  const result = {};
  const fieldMap = new Map();
  fields.forEach(f => fieldMap.set(f.name, f));

  for (let row = range.s.r; row <= range.e.r; row++) {
    const nameAddr = XLSX.utils.encode_cell({ r: row, c: firstCol });
    const nameCell = sheet[nameAddr];
    const name = nameCell ? String(nameCell.v).trim() : '';

    if (!name || name.startsWith('#') || !fieldMap.has(name)) continue;

    const field = fieldMap.get(name);
    const valueAddr = XLSX.utils.encode_cell({ r: row, c: valueCol });
    const valueCell = sheet[valueAddr];
    let val = valueCell ? valueCell.v : null;

    const alias = field.alias || field.name;

    if (field.type === 'number') {
      val = toNumber(val);
      if (val === null && !field.nullable) val = 0;
    } else {
      val = val === null || val === undefined ? null : String(val);
      if (val === null && !field.nullable) val = "";
    }

    result[alias] = val;
  }
  return result;
}

/**
 * 生成配置表接口定义
 * @param tableInterfaces 表信息数组
 */
function generateTableInterfaces(tableInterfaces) {
  if (!tableInterfaces || tableInterfaces.length === 0) {
    return `/**
 * 配置表接口定义
 * 此文件由配置工具自动生成，请勿手动修改
 */

`;
  }

  const interfaceDefinitions = tableInterfaces.map(table => {
    const { fileName, sheetName, tableName, tableType, fields } = table;

    // 表注释：文件名 - 页签名
    const tableComment = `/**
 * ${fileName} - ${sheetName}
 * ${tableType === 'list' ? '列表表' : '常数表'}
 */`;

    if (tableType === 'list') {
      // 列表表：生成接口，字段使用 alias，类型根据字段类型确定
      const fieldDefinitions = (fields || []).map(field => {
        const alias = field.alias || field.name;
        const fieldName = field.name || '';
        const fieldType = field.type === 'number' ? 'number' : 'string';
        const nullable = field.nullable === true;
        const optional = nullable ? '?' : '';

        // 字段注释：字段名（中文）
        const fieldComment = fieldName ? `    /** ${fieldName} */` : '';
        return `${fieldComment}
    ${alias}${optional}: ${fieldType};`;
      }).join('\n');

      return `${tableComment}
export interface ${tableName} {
${fieldDefinitions}
}`;
    } else {
      // 常数表：生成接口，字段使用 alias，类型根据字段类型确定
      const fieldDefinitions = (fields || []).map(field => {
        const alias = field.alias || field.name;
        const fieldName = field.name || '';
        const fieldType = field.type === 'number' ? 'number' : 'string';
        const nullable = field.nullable === true;
        const optional = nullable ? '?' : '';

        // 字段注释：字段名（中文）
        const fieldComment = fieldName ? `    /** ${fieldName} */` : '';
        return `${fieldComment}
    ${alias}${optional}: ${fieldType};`;
      }).join('\n');

      return `${tableComment}
export interface ${tableName} {
${fieldDefinitions}
}`;
    }
  }).join('\n\n');

  return `/**
 * 配置表接口定义
 * 此文件由配置工具自动生成，请勿手动修改
 */

${interfaceDefinitions}
`;
}

// ==================== 导出主函数 ====================

async function exportConfig(configDir, annotationDir, jsonDir, scriptDir) {
  if (!configDir || !annotationDir || !jsonDir) {
    throw new Error('导出配置缺少必要目录参数：configDir, annotationDir, jsonDir');
  }

  try {
    await fs.ensureDir(jsonDir);

    // 1. 获取结构
    const configResult = await buildConfigStructure(configDir);
    const exportTasks = [];
    const errors = [];

    for (const fileStruct of configResult) {
      const { fileName, sheets, absolutePath, error } = fileStruct;
      if (error || fileName.startsWith('#') || fileName.startsWith('~$')) continue;

      for (const sheetName of sheets) {
        if (sheetName.startsWith('#')) continue;

        const annotationPath = getAnnotationFilePath(annotationDir, fileName, sheetName);
        if (!(await fs.pathExists(annotationPath))) continue;

        try {
          const annotationData = await fs.readJson(annotationPath);
          // 简单校验：必须有表名、类型
          if (!annotationData.tableName || !annotationData.tableType) continue;
          // 必须有字段
          if (!Array.isArray(annotationData.fields) || annotationData.fields.length === 0) continue;

          exportTasks.push({
            fileName,
            sheetName,
            absolutePath,
            annotation: annotationData
          });
        } catch (e) {
          console.warn(`读取标注失败: ${fileName} - ${sheetName}`, e);
        }
      }
    }

    // 2. 执行导出并合并数据
    const allGameData = {};
    const tableNames = []; // 收集所有表名，用于生成枚举
    const tableInterfaces = []; // 收集所有表信息，用于生成接口

    for (const task of exportTasks) {
      try {
        const workbook = XLSX.readFile(task.absolutePath, { sheetStubs: true });
        const sheet = workbook.Sheets[task.sheetName];
        if (!sheet) {
          errors.push(`${task.fileName} - ${task.sheetName}: 页签不存在`);
          continue;
        }

        const { tableName, tableType, fields } = task.annotation;

        let exportData = null;

        if (tableType === 'list') {
          exportData = extractListTableData(sheet, fields);
        } else if (tableType === 'constant') {
          exportData = extractConstantTableData(sheet, fields);
        }

        if (exportData !== null) {
          allGameData[tableName] = exportData;
          // 收集页签名和标注名，用于生成枚举
          tableNames.push({
            sheetName: task.sheetName,
            tableName: tableName
          });
          // 收集表信息，用于生成接口
          tableInterfaces.push({
            fileName: task.fileName,
            sheetName: task.sheetName,
            tableName: tableName,
            tableType: tableType,
            fields: fields
          });
        }
      } catch (err) {
        errors.push(`${task.fileName} - ${task.sheetName}: 导出失败 - ${err.message}`);
      }
    }

    // 3. 压缩并写入二进制文件
    const jsonString = JSON.stringify(allGameData);
    const buffer = Buffer.from(jsonString, 'utf-8');
    const compressed = zlib.gzipSync(buffer);
    const binPath = path.join(jsonDir, 'gamedata.bin');
    await fs.writeFile(binPath, compressed);
    console.log(`✓ 已生成二进制文件: ${binPath}`);

    // 4. 生成解压脚本 (如果配置了 scriptDir)
    if (scriptDir) {
      await fs.ensureDir(scriptDir);

      // 生成配置表枚举
      // 枚举名：_ + 页签名，枚举值：标注名（tableName）
      const enumEntries = tableNames.map(({ sheetName, tableName }) => {
        // 枚举名：_ + 页签名（页签名可能包含中文，需要转换为合法的变量名）
        // 将中文字符转换为拼音或使用转义，这里简单处理：保留中文字符（TypeScript 支持 Unicode 标识符）
        const enumName = `_${sheetName}`;
        return `    ${enumName} = "${tableName}"`;
      });

      const enumContent = enumEntries.length > 0
        ? `/**
 * 配置表名称枚举
 */
export enum GameConfigName {
${enumEntries.join(',\n')}
}
`
        : `/**
 * 配置表名称枚举
 */
export enum GameConfigName {
}
`;

      const scriptContent = `
import { BufferAsset } from 'cc';
import * as pako from 'pako';

${enumContent}
/**
 * 游戏数据管理器
 * 单例模式，需外部加载数据后调用 init 初始化
 * 注意：需要在项目中安装 pako: npm install pako @types/pako
 */
export class GameConfigMgr {
    private static _ins: GameConfigMgr | null = null;
    private _data: any = null;

    private constructor() {}

    public static get ins(): GameConfigMgr {
        if (!this._ins) {
            this._ins = new GameConfigMgr();
        }
        return this._ins;
    }

    /**
     * 初始化数据
     * @param data 游戏配置数据 (支持 BufferAsset, ArrayBuffer 或已解析的对象)
     */
    public init(data: BufferAsset | ArrayBuffer | any) {
        if (!data) {
            console.error("GameConfigMgr: init data is null or undefined");
            return;
        }

        if (data instanceof BufferAsset) {
            this._parseBuffer(data.buffer());
        } else if (data instanceof ArrayBuffer) {
            this._parseBuffer(data);
        } else {
            // 假设是已经解析好的对象
            this._data = data;
        }
    }

    private _parseBuffer(buffer: ArrayBuffer) {
        const uint8Array = new Uint8Array(buffer);
        // 使用 pako 解压 gzip 数据
        const jsonStr = pako.ungzip(uint8Array, { to: 'string' });
        this._data = JSON.parse(jsonStr);
    }

    /**
     * 获取指定表的数据
     * @param cfgName 表名
     */
    public getConfig<T>(cfgName: GameConfigName): T {
        if (!this._data) {
            throw new Error("Game data not initialized. Call init() first.");
        }
        return this._data[cfgName];
    }

    /**
     * 获取指定表的数据
     * @param cfgName 表名
     * @param id 主键id
     */
    public getConfigById<T>(cfgName: GameConfigName, id: string): T {
        let cfg = this.getConfig<T[]>(cfgName);
        if (!cfg) {
            console.error("配置表"+cfgName+"不存在id:"+id);
            return null as any;
        }
        let cfgItem = cfg.find(item => item['id'] === id);
        if (!cfgItem) {
            console.error("配置表"+cfgName+"不存在id:"+id);
            return null as any;
        }
        return cfgItem;
    }

    /**
     * 根据模板筛选配置
     * @param cfgName 表名
     * @param template 模板对象，包含要匹配的字段值
     * @returns 匹配的配置项数组
     */
    public getConfigByTemplate<T>(cfgName: GameConfigName, template: Partial<T>): T[] {
        let cfg = this.getConfig<T[]>(cfgName);
        if (!cfg) {
            console.error("配置表"+cfgName+"不存在");
            return [];
        }
        
        if (!Array.isArray(cfg)) {
            console.error("配置表"+cfgName+"不是列表表，无法使用模板查询");
            return [];
        }

        // 筛选符合模板的配置项
        return cfg.filter(item => {
            // 检查模板中的每个字段是否匹配
            for (const key in template) {
                if (template.hasOwnProperty(key)) {
                    const templateValue = template[key];
                    const itemValue = item[key];
                    
                    // 如果模板值为 undefined 或 null，跳过该字段
                    if (templateValue === undefined || templateValue === null) {
                        continue;
                    }
                    
                    // 严格相等比较
                    if (itemValue !== templateValue) {
                        return false;
                    }
                }
            }
            return true;
        });
    }
}
`;
      await fs.writeFile(path.join(scriptDir, 'GameConfigMgr.ts'), scriptContent.trim());
      console.log(`✓ 已生成脚本文件: ${path.join(scriptDir, 'GameConfigMgr.ts')}`);

      // 5. 生成配置表接口文件
      const interfaceContent = generateTableInterfaces(tableInterfaces);
      await fs.writeFile(path.join(scriptDir, 'GameConfigInterfaces.ts'), interfaceContent);
      console.log(`✓ 已生成接口文件: ${path.join(scriptDir, 'GameConfigInterfaces.ts')}`);
    }

    if (errors.length > 0) {
      console.warn('\n导出过程中出现以下错误:');
      errors.forEach(err => console.warn(`  - ${err}`));
    }

    console.log(`\n✓ 导出完成！共处理 ${exportTasks.length} 个配置表`);
    return { success: true, errors };
  } catch (error) {
    console.error('导出失败:', error);
    throw error;
  }
}

// ==================== 命令行参数解析 ====================

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        params[key] = value;
        i++; // 跳过下一个参数，因为已经被使用了
      } else {
        params[key] = true; // 布尔标志
      }
    }
  }

  return params;
}

// ==================== 主程序入口 ====================

async function main() {
  const params = parseArgs();

  // 显示帮助信息
  if (params.help || params.h) {
    console.log(`
配置表导出脚本

使用方法：
  node export-config.js --configDir <配置表目录> --annotationDir <标注目录> --jsonDir <JSON导出目录> [--scriptDir <脚本导出目录>]

参数说明：
  --configDir      配置表目录（必需），包含 Excel 文件的目录
  --annotationDir  标注文件目录（必需），包含标注 JSON 文件的目录
  --jsonDir        JSON 导出目录（必需），导出 gamedata.bin 的目录
  --scriptDir      脚本导出目录（可选），导出 TypeScript 脚本的目录

示例：
  node export-config.js --configDir "./配置" --annotationDir "./配置/标注" --jsonDir "./配置/json" --scriptDir "./配置/ts"
    `);
    process.exit(0);
  }

  const configDir = params.configDir;
  const annotationDir = params.annotationDir;
  const jsonDir = params.jsonDir;
  const scriptDir = params.scriptDir;

  if (!configDir || !annotationDir || !jsonDir) {
    console.error('错误: 缺少必需参数');
    console.error('请使用 --help 查看使用说明');
    process.exit(1);
  }

  // 转换为绝对路径
  const absConfigDir = path.resolve(configDir);
  const absAnnotationDir = path.resolve(annotationDir);
  const absJsonDir = path.resolve(jsonDir);
  const absScriptDir = scriptDir ? path.resolve(scriptDir) : null;

  console.log('开始导出配置表...');
  console.log(`配置表目录: ${absConfigDir}`);
  console.log(`标注目录: ${absAnnotationDir}`);
  console.log(`JSON导出目录: ${absJsonDir}`);
  if (absScriptDir) {
    console.log(`脚本导出目录: ${absScriptDir}`);
  }
  console.log('');

  try {
    await exportConfig(absConfigDir, absAnnotationDir, absJsonDir, absScriptDir);
    process.exit(0);
  } catch (error) {
    console.error('导出失败:', error.message);
    process.exit(1);
  }
}

// 运行主程序
if (require.main === module) {
  main();
}

module.exports = { exportConfig };

