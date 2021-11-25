import fs from 'fs'
import { join } from 'path'
import { endGroup, startGroup } from '@actions/core'
import execa from 'execa'
import { trueCasePath } from 'true-case-path'
import { readPackageJsonFile } from 'typed-jsonfile'
import urlJoin from 'url-join'
import { safeExeca } from '../presets-common/execute'
import { InputData, PresetMain } from '../presets-common/type'
import { markdownRemoveHeading } from '../readmeUtils'
import { execAsStep } from '../utils'
// always pnpm is used in this preset

/** shared main for vscode-extension* presets */
export const sharedMain = async ({ repo }: InputData<'vscode-extension'>) => {
    const initialPackageJson = await readPackageJsonFile({ dir: '.' })
    const hasCode = fs.existsSync('src/extension.ts')
    await execAsStep('pnpm', 'i -g vsce ovsx')
    await execAsStep('vsce', '-V')
    if (hasCode && !fs.existsSync('src/generated.ts')) await execAsStep('pnpm', 'vscode-framework generate-types')

    if (!initialPackageJson.scripts?.build && hasCode) await execAsStep('pnpm', 'vscode-framework build')
    else if (initialPackageJson.scripts?.build) await execAsStep('pnpm', 'run build')

    const copyFiles = ['LICENSE']

    const CHANGELOG_CONTENT = `# Changelog\nChangelog will go here in future releases. For now you can view [changelog at GitHub](${urlJoin(
        repo.url,
        'releases',
    )})`
    await fs.promises.writeFile(hasCode ? 'out/CHANGELOG.MD' : 'CHANGELOG.MD', CHANGELOG_CONTENT, 'utf-8')
    if (hasCode) for (const fileName of copyFiles) await fs.promises.copyFile(fileName, join('out', fileName))

    const readmeFilePath = await trueCasePath('readme.md').catch(() => undefined)
    if (readmeFilePath) {
        const readme = await fs.promises.readFile(readmeFilePath, 'utf-8')
        const newReadme = await markdownRemoveHeading(readme, 'Extension Development Notes')
        await fs.promises.writeFile(hasCode ? 'out/README.MD' : readmeFilePath, newReadme)
    }

    const vsixPath = join(process.cwd(), 'output.vsix')
    await safeExeca('vsce', ['package', '--out', vsixPath], {
        cwd: hasCode ? join(process.cwd(), 'out') : '.',
    })
    const SIZE_LIMIT = 3 * 1024 * 1024 // 3 MB
    if ((await fs.promises.stat(vsixPath)).size > SIZE_LIMIT) throw new Error('SIZE_LIMIT exceeded in 3 MB')
    return { vsixPath }
}

export const main: PresetMain<'vscode-extension'> = async input => {
    const { vsixPath } = await sharedMain(input)

    const { presetConfig } = input
    if (presetConfig.publishMarketplace)
        await execAsStep('vsce', ['publish', '--packagePath', vsixPath], {
            stdio: 'inherit',
        })
    if (presetConfig.publishOvsx)
        await execAsStep('ovsx', ['publish', vsixPath], {
            stdio: 'inherit',
        })

    if (presetConfig.attachVsix) {
        const packageJson = await readPackageJsonFile({ dir: '.' })
        return {
            assets: [
                {
                    name: `${packageJson.name!}-${packageJson.version!}.vsix`,
                    path: vsixPath,
                },
            ],
        }
    }

    return undefined
}
