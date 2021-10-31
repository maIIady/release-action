/// <reference types="jest" />
import { getNextVersionAndReleaseNotes } from '../src/library/bumpVersion'
import { defaultConfig } from '../src/library/config'
import { getMockedOctokit } from './bumpVersion.test'
import { generateChangelog } from '../src/library/changelogGenerator'

test('Generatees changelog', async () => {
    const results = await getNextVersionAndReleaseNotes({
        octokit: getMockedOctokit(
            [{ name: 'v0.0.9', commit: { sha: '123' } }],
            [
                'fix: fix serious issue\nfeat: add new feature\nBREAKING config was removed',
                'feat(button): just adding feature\nBREAKING we broke anything',
                '[smth] fix(library-action): first fixes',
                'feat: new feature!',
                {
                    message: 'feat: should not be here',
                    sha: '123',
                },
            ],
        ),
        config: defaultConfig,
        repo: { owner: 'user', repo: 'repository' },
    })
    expect(generateChangelog(results.commitsByRule, 'default')).toMatchInlineSnapshot(`
    "## BREAKING CHANGES

    - add new feature
    config was removed
    - **button**: just adding feature
    we broke anything
    ### New Features

    - new feature!
    ### Bug Fixes

    - fix serious issue
    - **library-action**: first fixes"
  `)
})
