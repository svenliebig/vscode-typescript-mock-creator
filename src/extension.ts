import { existsSync } from "fs"
import { mkdir, stat, writeFile } from "fs/promises"
import { join, parse, relative, resolve } from "path"
import { Parser, rewrite, TypeTransformers, getAllEnumsInside } from "ts-partial-type-resolver"
import { TypeDeclaration } from "ts-partial-type-resolver/types/models/TypeDeclaration"
import * as vscode from "vscode"
import { configuration } from "./configuration"

export function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand("setContext", "tsmc.supportedLangIds", ["typescript", "typescriptreact", "java"])

  let disposable = vscode.commands.registerCommand("typescript-mock-creator.generateMock", async (...args) => {
    const files = await vscode.workspace.findFiles(".vscode/parser.ts")

    if (files.length === 0) {
      return vscode.window.showErrorMessage("Could not find any parser.ts in the directory .vscode")
    }

    if (files.length === 1) {
      const options: { transformers: TypeTransformers; header?(): string; doNotResolve?: Array<string> } = require(files[0].fsPath)
      const fileName = vscode.window.activeTextEditor?.document.fileName

      if (fileName) {
        const { base } = parse(fileName)

        const parser = new Parser(fileName, { breakOnUnresolvedImports: true, doNotResolve: options.doNotResolve })
        const declarations = parser.getDeclarations()

        if (declarations.length === 0) {
          return vscode.window.showErrorMessage(`No type declarations available in ${fileName}.`)
        }

        const typeToMock = await vscode.window.showQuickPick(
          declarations.map((declaration) => declaration.identifier),
          { title: "For which type do you like to create a mock?", placeHolder: "..." }
        )

        if (typeToMock) {
          const declaration = parser.resolve(typeToMock)
          const rewritten = rewrite(declaration.type, options.transformers)

          const newFilePath = resolve(fileName, configuration.getMockLocation(), `mock${capitalize(base)}`)
          const importPath = getRelativeImportPath(newFilePath, fileName)

          // TODO actually collect imports into something like Map<filepath, Array<TypeDeclaration>> and write them properly
          const imports = [writeImport({ declaration, from: importPath })]

          for (const enumType of getAllEnumsInside(declaration.type)) {
            const enumDeclaration = parser.getDeclaration(enumType.name)
            if (enumDeclaration) {
              const enumFile = parser.getSourcePathOf(enumDeclaration)
              if (enumFile) {
                imports.push(writeImport({ declaration: enumDeclaration, from: getRelativeImportPath(newFilePath, enumFile) }))
              }
            }
          }

          const mockfile = prettify(
            `${options.header ? `${options.header()}\n` : ""}${imports.join("\n")}\n\nexport const mock${declaration.identifier}: ${
              declaration.identifier
            } = ${rewritten}`
          )

          await write(newFilePath, mockfile)
          showDocument(newFilePath)
        }
      }
    }

    vscode.window.showInformationMessage("Hello World from typescript-mock-creator!")
  })

  context.subscriptions.push(disposable)
}

function getRelativeImportPath(importing: string, imported: string) {
  const { dir: importedDir, name: importedName } = parse(imported)
  const importedFilepath = join(importedDir, importedName)
  return relative(parse(importing).dir, importedFilepath)
}

function writeImport({ declaration, from }: { declaration: TypeDeclaration; from: string }) {
  let result = ""

  if (declaration.default) {
    result += `${declaration.identifier}`
  } else {
    result += `{ ${declaration.identifier} }`
  }

  result += `${result !== "" ? " from " : ""}"${from.replace(/\\/g, "/")}"`

  return `import ${result}`
}

export function deactivate() {}

const capitalize = (str: string) => {
  if (typeof str === "string") {
    return str.replace(/^\w/, (c) => c.toUpperCase())
  } else {
    return ""
  }
}

export type PrettifyOptions = {
  separator: "  " | "    " | "\t"
}

const defaultOptions: PrettifyOptions = { separator: "  " }

export function prettify(str: string, { separator = "  " }: PrettifyOptions = defaultOptions) {
  let deep = 0

  function sep() {
    return separator.repeat(deep)
  }

  return str.replace(/(\{\s|\,\s|\s\})/g, (substring: string, ...args: any[]) => {
    if (substring.includes("{")) {
      deep++
      return `{\n${sep()}`
    }

    if (substring.includes(",")) {
      return `,\n${sep()}`
    }

    if (substring.includes("}")) {
      deep--
      return `\n${sep()}}`
    }

    return substring
  })
}

export async function assureDir(path: string) {
  if (existsSync(path)) {
    if (!isFolder(path)) {
      throw new Error(`Path is not a folder. Stop messing around. (${path})`)
    }
  } else {
    await mkdir(path, { recursive: true })
  }
}

export async function isFolder(path: string) {
  const res = await stat(path)
  return res.isDirectory()
}

async function write(path: string, content: string) {
  const { dir } = parse(path)
  await assureDir(dir)
  await writeFile(path, content, { encoding: "utf-8" })
}

export async function showDocument(filePath: string) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
  await vscode.window.showTextDocument(doc, 1, false)
}
