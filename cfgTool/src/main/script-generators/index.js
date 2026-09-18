const path = require('path');
const fs = require('fs-extra');
const { generateTypeScriptScripts } = require('./typescript');
const { generateCSharpScripts } = require('./csharp');

function normalizeScriptLanguage(scriptLanguage) {
  return scriptLanguage === 'csharp' ? 'csharp' : 'typescript';
}

async function generateScripts({ scriptDir, scriptLanguage, tableNames, tableInterfaces }) {
  if (!scriptDir) {
    return { success: true, language: null, files: [] };
  }

  const language = normalizeScriptLanguage(scriptLanguage);
  const generated = language === 'csharp'
    ? generateCSharpScripts({ tableNames, tableInterfaces })
    : generateTypeScriptScripts({ tableNames, tableInterfaces });

  await fs.ensureDir(scriptDir);
  const writtenFiles = [];
  for (const file of generated.files) {
    const filePath = path.join(scriptDir, file.fileName);
    await fs.writeFile(filePath, file.content);
    writtenFiles.push(filePath);
  }

  return {
    success: true,
    language,
    files: writtenFiles
  };
}

module.exports = {
  generateScripts,
  normalizeScriptLanguage
};
