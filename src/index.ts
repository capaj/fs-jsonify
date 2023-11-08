#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { exec } from 'child_process'
import { globby } from 'globby'

const execAsync = promisify(exec)

interface FileStructure {
  type: string
  name: string
  path: string
  children?: FileStructure[]
  content?: string
}

// Function to check if a file is binary
const isBinaryFileSync = (filePath: string): boolean => {
  const chunk = fs.readFileSync(filePath)
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] === 0) return true // Found null byte, it's a binary file
  }
  return false
}

// Function to get files under version control
const getGitTrackedFiles = async (rootPath: string): Promise<string[]> => {
  const { stdout } = await execAsync('git ls-files', { cwd: rootPath })
  return stdout.split('\n').filter(Boolean)
  // .map((file) => path.join(rootPath, file))
}

// Function to create the JSON structure
const createJsonStructure = (
  filePaths: string[],
  rootPath: string
): FileStructure => {
  const root: FileStructure = {
    type: 'folder',
    name: path.basename(rootPath),
    path: rootPath,
    children: []
  }

  const pathsStructure: { [key: string]: FileStructure } = { [rootPath]: root }

  filePaths.forEach((filePath) => {
    const fileRelativePath = path.relative(rootPath, filePath)
    const fileParts = fileRelativePath.split(path.sep)

    let currentPath = rootPath
    let currentStructure = root

    fileParts.forEach((part, index) => {
      currentPath = path.join(currentPath, part)

      if (!pathsStructure[currentPath]) {
        pathsStructure[currentPath] = {
          type: index === fileParts.length - 1 ? 'file' : 'folder',
          name: part,
          path: currentPath
        }

        if (index === fileParts.length - 1) {
          if (isBinaryFileSync(filePath)) {
            console.warn(`Skipping binary file: ${filePath}`)
          } else {
            pathsStructure[currentPath].content = fs.readFileSync(
              filePath,
              'utf8'
            )
          }
        } else {
          pathsStructure[currentPath].children = []
        }

        currentStructure.children!.push(pathsStructure[currentPath])
      }

      currentStructure = pathsStructure[currentPath]
    })
  })

  return root
}

// Function to read files and generate JSON structure
const readFilesAndGenerateJson = async (pattern: string) => {
  const files = await globby(pattern)
  console.log(`total files ${files.length}`)

  const rootPath = process.cwd()

  const gitTrackedFiles = await getGitTrackedFiles(rootPath)

  const filteredFiles = files.filter((file) => gitTrackedFiles.includes(file))
  const jsonStructure = createJsonStructure(filteredFiles, rootPath)

  const fileName = path.basename(process.cwd())
  fs.writeFileSync(
    path.join(rootPath, `${fileName}.json`),
    JSON.stringify(jsonStructure, null, 2)
  )

  console.log(`${fileName}.json generated successfully!`)
}

readFilesAndGenerateJson(process.argv[2])
