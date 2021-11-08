/// <reference types="jest" />
import { Octokit } from '@octokit/rest'
import typedJsonFile from 'typed-jsonfile'
import { getNextVersionAndReleaseNotes } from '../src/library/bumpVersion'
import { defaultConfig } from '../src/library/config'

type Commit = {
    message: string
    sha?: string
}

// To its own files
export const getMockedOctokit = (tags: { name: `v${string}`; commit: { sha: string } }[], commitsInput: (Commit | string)[]) => {
    const commits: { sha: string; commit: { message: string } }[] = commitsInput.map(data => {
        if (typeof data === 'string') return { commit: { message: data }, sha: '' }
        const { message, sha = '' } = data
        return { commit: { message }, sha }
    })
    return {
        repos: {
            async listTags() {
                return { data: tags }
            },
            async listCommits() {
                return { data: commits }
            },
        },
    } as unknown as Octokit
}

const dummyRepo = { owner: 'user', repo: 'repository' }

const args = {
    config: defaultConfig,
    repo: dummyRepo,
}

const getVersionBumpFromCommits = async (commits: Array<string | Commit>, version = 'v0.0.9') => {
    return getNextVersionAndReleaseNotes({
        octokit: getMockedOctokit(
            [{ name: version as `v${string}`, commit: { sha: '123' } }],
            [
                ...commits,
                {
                    message: 'feat: should not be here',
                    sha: '123',
                },
            ],
        ),

        ...args,
    })
}

const mockPackageJsonOnce = (packageJson: Record<string, any>) => {
    const spy = jest.spyOn(typedJsonFile, 'readPackageJsonFile')
    spy.mockResolvedValueOnce(JSON.parse(JSON.stringify(packageJson)))
}

// TODO try to extract to fixtures for reuse

test('Initial release', async () => {
    mockPackageJsonOnce({
        private: true,
        version: '0.0.0',
    })
    expect(
        await getNextVersionAndReleaseNotes({
            octokit: getMockedOctokit([], ['feat: something added']),
            ...args,
        }),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "none",
      "commitsByRule": Object {
        "rawOverride": "🎉 Initial release",
      },
      "nextVersion": "0.0.1",
    }
  `)
})

test('Just bumps correctly', async () => {
    expect(
        await getVersionBumpFromCommits([
            'fix: fix serious issue\nfeat: add new feature',
            // TODO should be published only at this point
            '[publish] feat: just adding feature',
            // just ignored
            'WIP fix: first fixes',
        ]),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "patch",
      "commitsByRule": Object {
        "minor": Array [
          "add new feature",
          "just adding feature",
        ],
        "patch": Array [
          "fix serious issue",
          "first fixes",
        ],
      },
      "nextVersion": "0.0.10",
    }
  `)
})

test('No version bump', async () => {
    expect(
        //
        await getVersionBumpFromCommits(['fix serious issue\nfeature something new']),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "none",
      "commitsByRule": Object {},
      "nextVersion": undefined,
    }
  `)
})

test('Just bumps correctly when stable', async () => {
    expect(
        await getVersionBumpFromCommits(
            //
            ['fix: fix serious issue\nfeat: add new feature', 'feat: just adding feature', 'fix: first fixes'],
            'v1.0.9',
        ),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "minor",
      "commitsByRule": Object {
        "minor": Array [
          "add new feature",
          "just adding feature",
        ],
        "patch": Array [
          "fix serious issue",
          "first fixes",
        ],
      },
      "nextVersion": "1.1.0",
    }
  `)
})

test("Doesn't pick commits below version", async () => {
    expect(
        await getVersionBumpFromCommits(
            [
                'fix: fix serious issue\nfeat: add new feature',
                'feat: just adding feature',
                'fix: first fixes',
                {
                    message: 'feat: should not be here',
                    sha: '123',
                },

                {
                    message: 'feat: should not be here',
                    sha: '3213',
                },

                'feat: something else',
            ],
            'v1.0.9',
        ),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "minor",
      "commitsByRule": Object {
        "minor": Array [
          "add new feature",
          "just adding feature",
        ],
        "patch": Array [
          "fix serious issue",
          "first fixes",
        ],
      },
      "nextVersion": "1.1.0",
    }
  `)
})

test('BREAKING gives major', async () => {
    expect(
        await getVersionBumpFromCommits(
            [
                'fix: fix serious issue\nfeat: add new feature\nBREAKING config was removed',
                "feat: just adding feature\nBREAKING we broke anything\nfeat: but here we didn't break anything",
                'fix: first fixes',
            ],
            'v1.0.9',
        ),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "major",
      "commitsByRule": Object {
        "major": Array [
          "add new feature
    config was removed",
          "just adding feature
    we broke anything",
        ],
        "minor": Array [
          "but here we didn't break anything",
        ],
        "patch": Array [
          "fix serious issue",
          "first fixes",
        ],
      },
      "nextVersion": "2.0.0",
    }
  `)
})

test('BREAKING gives major on unstable', async () => {
    expect(
        await getVersionBumpFromCommits(
            [
                'fix: fix serious issue\nfeat: add new feature\nBREAKING config was removed',
                'feat: just adding feature\nBREAKING we broke anything',
                'fix: first fixes',
            ],
            'v0.0.7',
        ),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "minor",
      "commitsByRule": Object {
        "major": Array [
          "add new feature
    config was removed",
          "just adding feature
    we broke anything",
        ],
        "patch": Array [
          "fix serious issue",
          "first fixes",
        ],
      },
      "nextVersion": "0.1.0",
    }
  `)
})

test('Extracts scopes correctly', async () => {
    expect(
        await getVersionBumpFromCommits(
            [
                'fix: fix serious issue\nfeat: add new feature\nBREAKING config was removed',
                'feat(button): just adding feature\nBREAKING we broke anything',
                "fix: some things\nfeat(button): we're insane!\nNote: yes, we are!\n",
                'fix(library-action): first fixes',
            ],
            'v0.0.7',
        ),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "minor",
      "commitsByRule": Object {
        "major": Array [
          "add new feature
    config was removed",
          "**button**: just adding feature
    we broke anything",
        ],
        "minor": Array [
          "**button**: we're insane!",
        ],
        "patch": Array [
          "fix serious issue",
          "some things",
          "**library-action**: first fixes",
        ],
      },
      "nextVersion": "0.1.0",
    }
  `)
})

test("Extracts sha's correctly", async () => {
    expect(
        await getVersionBumpFromCommits([
            "fix: something fixed but we don't care",
            {
                message: 'fix: fix serious issue\nfeat: add new feature\nBREAKING config was removed',
                sha: '7f8468286354936e8817607d7a2087715bbe1854',
            },

            {
                message: 'fix: something was contributed (#123)',
                sha: '7f8468286354936e8817607d7a2087715bbe1854',
            },
        ]),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "minor",
      "commitsByRule": Object {
        "major": Array [
          "add new feature
    config was removed [\`7f84682\`](https://github.com/user/repository/commit/7f8468286354936e8817607d7a2087715bbe1854)",
        ],
        "patch": Array [
          "something fixed but we don't care",
          "fix serious issue [\`7f84682\`](https://github.com/user/repository/commit/7f8468286354936e8817607d7a2087715bbe1854)",
          "something was contributed (#123)",
        ],
      },
      "nextVersion": "0.1.0",
    }
  `)
})

// TODO
test.skip('Strips empty lines', async () => {
    expect(
        await getVersionBumpFromCommits([
            {
                message: `feat: add support for reading jsonc files
By default it's enabled when path ends with \`.jsonc\`
feat: options must be object and not null or string
BREAKING
fix(types): allow to omit 2nd arg for \`readTsconfigJsonFile\`
`,
                sha: '328',
            },
            {
                message: 'feat: should not be here',
                sha: '123',
            },
        ]),
    ).toMatchInlineSnapshot(``)
})

test('Extracts conventional commit info', async () => {
    expect(
        //
        await getVersionBumpFromCommits(["fix: TypeError: Cannot read property 'nextVersion' of undefined NPM Release"]),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "patch",
      "commitsByRule": Object {
        "patch": Array [
          "TypeError: Cannot read property 'nextVersion' of undefined NPM Release",
        ],
      },
      "nextVersion": "0.0.10",
    }
  `)
})

// give better name to the test?
test('Operates on description properly', async () => {
    const includeCommit = `
fix: This rare bug was finally fixed closes #33343

Some background for bug goes here...
feat: Add new feature within commit
Description`
    /** only fix should be included, but not test */
    const notIncludeCommit = `
fix: This rare bug was finally fixed fixes #33343

fixes #453
Some background for bug goes here...
test: Fix tests
Tests were hard to fix`

    expect(
        //
        await getVersionBumpFromCommits([includeCommit, notIncludeCommit, 'fix: first fixes'], 'v1.0.9'),
    ).toMatchInlineSnapshot(`
    Object {
      "bumpType": "minor",
      "commitsByRule": Object {
        "minor": Array [
          "Add new feature within commit
    Description",
        ],
        "patch": Array [
          "This rare bug was finally fixed
    Some background for bug goes here... (#33343)",
          "This rare bug was finally fixed

    Some background for bug goes here... (#33343, #453)",
          "first fixes",
        ],
      },
      "nextVersion": "1.1.0",
    }
  `)
})

test('Pick all commits even if they are > 100', async () => {
    const { commitsByRule } = await getNextVersionAndReleaseNotes({
        octokit: {
            repos: {
                async listTags() {
                    return { data: [{ name: 'v0.0.1', commit: { sha: '123' } }] }
                },
                async listCommits({ page }) {
                    let commits: { sha: string; commit: { message: string } }[] = []
                    if (page === 1) {
                        commits = Array.from({ length: 100 }, (_, i) => ({
                            commit: { message: `fix: ${i}` },
                            sha: '',
                        }))
                    } else if (page === 2) {
                        commits = Array.from({ length: 100 }, (_, i) => ({
                            commit: { message: `feat: ${i}` },
                            sha: '',
                        }))
                        commits.push({
                            commit: { message: 'feat: not included' },
                            sha: '123',
                        })
                    }
                    return { data: commits }
                },
            },
        } as any,
        ...args,
    })
    expect(commitsByRule['patch']).toHaveLength(100)
    expect(commitsByRule['minor']).toHaveLength(100)
})
