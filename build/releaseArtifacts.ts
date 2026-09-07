import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

const projectDocuments = [['LICENSE.txt', 'LICENSE']] as const

const licenseFilePattern = /^(?:licen[cs]e|copying|notice)(?:\..+)?$/i
const sourceFilePattern = /\.(?:css|svelte|ts)$/
const packageImportPattern = /(?:from\s*|import\s*\(\s*|@import\s+(?:url\(\s*)?)["']([^"']+)["']/g

interface PackageManifest {
  name?: unknown
  version?: unknown
  license?: unknown
}

interface BundledPackage {
  licenseFile: string
  licenseLabel: string
  licenseOutputPath: string
  name: string
  root: string
  version: string
}

function packageRootForModule(moduleId: string): string | undefined {
  const filePath = moduleId.split('?')[0].replace(/[\\/]/g, sep)
  if (!filePath.includes(`${sep}node_modules${sep}`)) return undefined

  let directory = dirname(filePath)
  while (directory !== dirname(directory)) {
    if (existsSync(join(directory, 'package.json'))) return directory
    directory = dirname(directory)
  }
}

function findLicenseFile(packageRoot: string): string | undefined {
  return readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && licenseFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))[0]
}

function licenseLabel(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string') {
    return value.type
  }
  return 'See license file'
}

function licenseSlug(name: string, version: string): string {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}`.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function sourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (entry.isFile() && sourceFilePattern.test(entry.name)) files.push(path)
  }
  return files
}

function packageRootForSpecifier(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('$')) {
    return undefined
  }

  const segments = specifier.split('/')
  const packageName = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
  const packageRoot = resolve('node_modules', packageName)
  return existsSync(join(packageRoot, 'package.json')) ? packageRoot : undefined
}

function sourcePackageRoots(): string[] {
  const packageRoots = new Set<string>()
  for (const sourceFile of sourceFiles(resolve('src'))) {
    const source = readFileSync(sourceFile, 'utf8')
    for (const match of source.matchAll(packageImportPattern)) {
      const packageRoot = packageRootForSpecifier(match[1])
      if (packageRoot) packageRoots.add(packageRoot)
    }
  }
  return [...packageRoots]
}

function bundledPackages(
  moduleIds: Iterable<string>,
  additionalPackageRoots: Iterable<string>,
): BundledPackage[] {
  const packages = new Map<string, BundledPackage>()
  const packageRoots = new Set(additionalPackageRoots)

  for (const moduleId of moduleIds) {
    const packageRoot = packageRootForModule(moduleId)
    if (packageRoot) packageRoots.add(packageRoot)
  }

  for (const packageRoot of packageRoots) {
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as PackageManifest
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue

    const licenseFile = findLicenseFile(packageRoot)
    if (!licenseFile) {
      throw new Error(
        `Bundled package ${manifest.name}@${manifest.version} has no recognizable license file at ${relative(process.cwd(), packageRoot)}.`,
      )
    }

    const licenseOutputPath = `licenses/${licenseSlug(manifest.name, manifest.version)}.txt`
    packages.set(packageRoot, {
      licenseFile,
      licenseLabel: licenseLabel(manifest.license),
      licenseOutputPath,
      name: manifest.name,
      root: packageRoot,
      version: manifest.version,
    })
  }

  return [...packages.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function thirdPartyNotices(packages: BundledPackage[]): string {
  const rows = packages
    .map(
      (pkg) =>
        `| ${pkg.name} | ${pkg.version} | ${pkg.licenseLabel} | [license](${pkg.licenseOutputPath}) |`,
    )
    .join('\n')

  return `# Third-party notices

This file is generated during the production build from the npm packages that Vite includes in the browser bundle and that the application imports directly, including CSS-only packages. Collage Builder is licensed under Apache License 2.0; third-party components remain under their own licenses.

| Package | Version | Declared license | Included text |
| --- | --- | --- | --- |
${rows}

The \`licenses/\` directory contains the license file supplied by each listed package. The project source and lockfile identify the exact dependency graph used for this build. Components embedded within a package without their own npm package metadata require separate release review.
`
}

export function releaseArtifacts(): Plugin {
  const transformedModuleIds = new Set<string>()

  return {
    name: 'collage-builder-release-artifacts',
    apply: 'build',
    buildStart() {
      for (const [fileName, sourcePath] of projectDocuments) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(resolve(sourcePath)),
        })
      }
    },
    transform(_source, id) {
      transformedModuleIds.add(id)
      return null
    },
    generateBundle() {
      const packages = bundledPackages(
        [...this.getModuleIds(), ...transformedModuleIds],
        sourcePackageRoots(),
      )
      for (const pkg of packages) {
        this.emitFile({
          type: 'asset',
          fileName: pkg.licenseOutputPath,
          source: readFileSync(join(pkg.root, pkg.licenseFile)),
        })
      }
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_NOTICES.md',
        source: thirdPartyNotices(packages),
      })
    },
  }
}
