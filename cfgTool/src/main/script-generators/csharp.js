const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
  'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
  'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
  'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
  'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
  'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
  'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
  'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
  'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while',
  'add', 'alias', 'and', 'ascending', 'args', 'async', 'await', 'by',
  'descending', 'dynamic', 'equals', 'file', 'from', 'get', 'global', 'group',
  'init', 'into', 'join', 'let', 'managed', 'nameof', 'nint', 'not', 'notnull',
  'nuint', 'on', 'or', 'orderby', 'partial', 'record', 'remove', 'required',
  'scoped', 'select', 'set', 'unmanaged', 'value', 'var', 'when', 'where',
  'with', 'yield'
]);

function normalizeIdentifierBody(name, fallback = 'Item') {
  let ident = String(name || '').trim();
  ident = ident.replace(/[^\p{L}\p{Nl}\p{Nd}\p{Pc}]/gu, '_');
  ident = ident.replace(/_+/g, '_');
  ident = ident.replace(/^_+|_+$/g, '');

  if (!ident) {
    ident = fallback;
  }
  if (/^\d/.test(ident)) {
    ident = `_${ident}`;
  }
  return ident;
}

function escapeKeyword(ident) {
  return CSHARP_KEYWORDS.has(ident) ? `@${ident}` : ident;
}

function sanitizeCSharpIdentifier(name, fallback = 'Item') {
  return escapeKeyword(normalizeIdentifierBody(name, fallback));
}

function toEnumMember(sheetName, usedNames) {
  const base = `_${normalizeIdentifierBody(sheetName, 'Sheet')}`;
  let name = escapeKeyword(base);
  let index = 2;
  while (usedNames.has(name)) {
    name = escapeKeyword(`${base}_${index}`);
    index += 1;
  }
  usedNames.add(name);
  return name;
}

function toClassName(tableName, usedNames) {
  const base = sanitizeCSharpIdentifier(tableName, 'ConfigTable');
  let name = base;
  let index = 2;
  while (usedNames.has(name)) {
    name = `${base}_${index}`;
    index += 1;
  }
  usedNames.add(name);
  return name;
}

function toFieldName(alias, usedNames) {
  const base = sanitizeCSharpIdentifier(alias, 'field');
  let name = base;
  let index = 2;
  while (usedNames.has(name)) {
    name = `${base}_${index}`;
    index += 1;
  }
  usedNames.add(name);
  return name;
}

function escapeCSharpString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function csharpFieldType(field) {
  if (field.type === 'number') {
    return field.nullable === true ? 'double?' : 'double';
  }
  return 'string';
}

function generateEnumAndMap(tableNames) {
  const usedNames = new Set();
  const entries = (tableNames || []).map(({ sheetName, tableName }) => ({
    enumName: toEnumMember(sheetName, usedNames),
    tableName
  }));

  const enumBody = entries.length > 0
    ? entries.map(entry => `        ${entry.enumName},`).join('\n')
    : '';

  const mapBody = entries.length > 0
    ? entries.map(entry => `            { GameConfigName.${entry.enumName}, "${escapeCSharpString(entry.tableName)}" },`).join('\n')
    : '';

  return `    public enum GameConfigName
    {
${enumBody}
    }

    internal static class GameConfigNameMap
    {
        public static readonly System.Collections.Generic.Dictionary<GameConfigName, string> TableKeys =
            new System.Collections.Generic.Dictionary<GameConfigName, string>
            {
${mapBody}
            };

        public static string GetTableKey(GameConfigName cfgName)
        {
            string tableKey;
            return TableKeys.TryGetValue(cfgName, out tableKey) ? tableKey : cfgName.ToString();
        }
    }
`;
}

function generateDataClasses(tableInterfaces) {
  if (!tableInterfaces || tableInterfaces.length === 0) {
    return `    // 暂无配置表
`;
  }

  const usedClassNames = new Set(['GameConfigMgr', 'GameConfigName', 'GameConfigNameMap']);
  return tableInterfaces.map(table => {
    const { fileName, sheetName, tableName, tableType, fields } = table;
    const className = toClassName(tableName, usedClassNames);
    const originalNote = className !== tableName ? ` 原表名：${tableName}` : '';
    const usedFieldNames = new Set();
    const fieldDefinitions = (fields || []).map(field => {
      const sourceAlias = field.alias || field.name || 'field';
      const fieldName = toFieldName(sourceAlias, usedFieldNames);
      const sourceName = field.name || '';
      const fieldType = csharpFieldType(field);
      const comment = sourceName ? `        /// <summary>${sourceName}</summary>\n` : '';
      return `${comment}        public ${fieldType} ${fieldName};`;
    }).join('\n');

    return `    /// <summary>${fileName} - ${sheetName} / ${tableType === 'list' ? '列表表' : '常数表'}${originalNote}</summary>
    [Serializable]
    public class ${className}
    {
${fieldDefinitions}
    }`;
  }).join('\n\n');
}

function generateGameConfigMgr(tableNames) {
  return `using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace GameConfig
{
    /// <summary>
    /// 配置表名称枚举与表名映射
    /// </summary>
${generateEnumAndMap(tableNames)}
    /// <summary>
    /// 游戏数据管理器
    /// 单例模式，需外部加载 TextAsset 后调用 ParseBin
    /// 可多次调用 ParseBin 合并多个 bin（默认 gamedata.bin，也可为表自定义 bin）
    /// 依赖：com.unity.nuget.newtonsoft-json
    /// </summary>
    public class GameConfigMgr
    {
        private static GameConfigMgr _ins;
        private JObject _data;

        private GameConfigMgr()
        {
        }

        public static GameConfigMgr Ins
        {
            get
            {
                if (_ins == null)
                {
                    _ins = new GameConfigMgr();
                }
                return _ins;
            }
        }

        /// <summary>
        /// 解析并合并一份 Unity TextAsset（gzip bin），可多次传入
        /// </summary>
        public void ParseBin(TextAsset asset)
        {
            if (asset == null)
            {
                Debug.LogError("GameConfigMgr: parseBin data is null or undefined");
                return;
            }
            MergeParsed(DecodeBuffer(asset.bytes));
        }

        /// <summary>
        /// 解析并合并一份原始 gzip 字节，可多次传入
        /// </summary>
        public void ParseBin(byte[] bytes)
        {
            if (bytes == null)
            {
                Debug.LogError("GameConfigMgr: parseBin data is null or undefined");
                return;
            }
            MergeParsed(DecodeBuffer(bytes));
        }

        private JObject DecodeBuffer(byte[] bytes)
        {
            using (var input = new MemoryStream(bytes))
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            using (var reader = new StreamReader(gzip, Encoding.UTF8))
            {
                return JObject.Parse(reader.ReadToEnd());
            }
        }

        private void MergeParsed(JObject parsed)
        {
            if (parsed == null)
            {
                return;
            }
            if (_data == null)
            {
                _data = new JObject();
            }
            foreach (var property in parsed.Properties())
            {
                _data[property.Name] = property.Value;
            }
        }

        /// <summary>
        /// 获取指定表的数据
        /// </summary>
        public T GetConfig<T>(GameConfigName cfgName)
        {
            if (_data == null)
            {
                throw new Exception("Game data not initialized. Call ParseBin() first.");
            }

            var token = _data[GameConfigNameMap.GetTableKey(cfgName)];
            if (token == null || token.Type == JTokenType.Null)
            {
                return default(T);
            }
            return token.ToObject<T>();
        }

        /// <summary>
        /// 按主键 id 获取列表表中的一项
        /// </summary>
        public T GetConfigById<T>(GameConfigName cfgName, string id)
        {
            if (_data == null)
            {
                throw new Exception("Game data not initialized. Call ParseBin() first.");
            }

            var token = _data[GameConfigNameMap.GetTableKey(cfgName)] as JArray;
            if (token == null)
            {
                Debug.LogError("配置表" + cfgName + "不存在id:" + id);
                return default(T);
            }

            for (var i = 0; i < token.Count; i++)
            {
                var item = token[i];
                if (item != null && (string)item["id"] == id)
                {
                    return item.ToObject<T>();
                }
            }

            Debug.LogError("配置表" + cfgName + "不存在id:" + id);
            return default(T);
        }

        /// <summary>
        /// 根据模板字段等值筛选列表表
        /// </summary>
        public List<T> GetConfigByTemplate<T>(GameConfigName cfgName, JObject template)
        {
            if (_data == null)
            {
                throw new Exception("Game data not initialized. Call ParseBin() first.");
            }

            var token = _data[GameConfigNameMap.GetTableKey(cfgName)] as JArray;
            if (token == null)
            {
                Debug.LogError("配置表" + cfgName + "不存在");
                return new List<T>();
            }

            if (template == null)
            {
                return token.ToObject<List<T>>() ?? new List<T>();
            }

            var result = new List<T>();
            for (var i = 0; i < token.Count; i++)
            {
                var item = token[i] as JObject;
                if (item == null)
                {
                    continue;
                }

                var matched = true;
                foreach (var property in template.Properties())
                {
                    if (property.Value == null || property.Value.Type == JTokenType.Null || property.Value.Type == JTokenType.Undefined)
                    {
                        continue;
                    }
                    var itemValue = item[property.Name];
                    if (itemValue == null || !JToken.DeepEquals(itemValue, property.Value))
                    {
                        matched = false;
                        break;
                    }
                }

                if (matched)
                {
                    result.Add(item.ToObject<T>());
                }
            }
            return result;
        }
    }
}
`;
}

function generateInterfaceFile(tableInterfaces) {
  return `using System;

namespace GameConfig
{
    /// <summary>
    /// 配置表数据类定义
    /// 此文件由配置工具自动生成，请勿手动修改
    /// </summary>
${generateDataClasses(tableInterfaces)}
}
`;
}

function generateCSharpScripts({ tableNames, tableInterfaces }) {
  return {
    files: [
      {
        fileName: 'GameConfigMgr.cs',
        content: generateGameConfigMgr(tableNames).trim() + '\n'
      },
      {
        fileName: 'GameConfigInterfaces.cs',
        content: generateInterfaceFile(tableInterfaces).trim() + '\n'
      }
    ]
  };
}

module.exports = {
  generateCSharpScripts,
  sanitizeCSharpIdentifier
};
