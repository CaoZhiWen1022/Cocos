function generateEnumContent(tableNames) {
  const enumEntries = (tableNames || []).map(({ sheetName, tableName }) => {
    const enumName = `_${sheetName}`;
    return `    ${enumName} = "${tableName}"`;
  });

  if (enumEntries.length > 0) {
    return `/**
 * 配置表名称枚举
 */
export enum GameConfigName {
${enumEntries.join(',\n')}
}
`;
  }

  return `/**
 * 配置表名称枚举
 */
export enum GameConfigName {
}
`;
}

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
    const tableComment = `/**
 * ${fileName} - ${sheetName}
 * ${tableType === 'list' ? '列表表' : '常数表'}
 */`;

    const fieldDefinitions = (fields || []).map(field => {
      const alias = field.alias || field.name;
      const fieldName = field.name || '';
      const fieldType = field.type === 'number' ? 'number' : 'string';
      const nullable = field.nullable === true;
      const optional = nullable ? '?' : '';
      const fieldComment = fieldName ? `    /** ${fieldName} */` : '';
      return `${fieldComment}
    ${alias}${optional}: ${fieldType};`;
    }).join('\n');

    return `${tableComment}
export interface ${tableName} {
${fieldDefinitions}
}`;
  }).join('\n\n');

  return `/**
 * 配置表接口定义
 * 此文件由配置工具自动生成，请勿手动修改
 */

${interfaceDefinitions}
`;
}

function generateGameConfigMgr(tableNames) {
  const enumContent = generateEnumContent(tableNames);
  return `
import { BufferAsset } from 'cc';
import * as pako from 'pako';

${enumContent}
/**
 * 游戏数据管理器
 * 单例模式，需外部加载数据后调用 parseBin
 * 可多次调用 parseBin 合并多个 bin（默认 gamedata.bin，也可为表自定义 bin）
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
     * 解析并合并一份 bin 数据，可多次传入不同 bin
     * @param data 游戏配置数据 (支持 BufferAsset, ArrayBuffer 或已解析的对象)
     */
    public parseBin(data: BufferAsset | ArrayBuffer | any) {
        if (!data) {
            console.error("GameConfigMgr: parseBin data is null or undefined");
            return;
        }

        if (data instanceof BufferAsset) {
            this._mergeParsed(this._decodeBuffer(data.buffer()));
        } else if (data instanceof ArrayBuffer) {
            this._mergeParsed(this._decodeBuffer(data));
        } else {
            this._mergeParsed(data);
        }
    }

    private _decodeBuffer(buffer: ArrayBuffer) {
        const uint8Array = new Uint8Array(buffer);
        const jsonStr = pako.ungzip(uint8Array, { to: 'string' });
        return JSON.parse(jsonStr);
    }

    private _mergeParsed(parsed: any) {
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        if (!this._data) {
            this._data = {};
        }
        Object.assign(this._data, parsed);
    }

    /**
     * 获取指定表的数据
     * @param cfgName 表名
     */
    public getConfig<T>(cfgName: GameConfigName): T {
        if (!this._data) {
            throw new Error("Game data not initialized. Call parseBin() first.");
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
`.trim();
}

function generateTypeScriptScripts({ tableNames, tableInterfaces }) {
  return {
    files: [
      {
        fileName: 'GameConfigMgr.ts',
        content: generateGameConfigMgr(tableNames)
      },
      {
        fileName: 'GameConfigInterfaces.ts',
        content: generateTableInterfaces(tableInterfaces)
      }
    ]
  };
}

module.exports = {
  generateTypeScriptScripts
};
