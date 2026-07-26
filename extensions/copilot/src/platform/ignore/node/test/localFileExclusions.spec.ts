/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { filterIgnoredTextSearchResults, IIgnoreService, NullIgnoreService } from '../../common/ignoreService';
import { matchesLocalFileExclusion } from '../ignoreServiceImpl';

suite('Local file exclusions', () => {
	const workspaceFolder = URI.file('/workspace');

	test('matches file names and workspace-relative paths', () => {
		expect([
			matchesLocalFileExclusion(URI.file('/workspace/src/token.secret'), workspaceFolder, ['*.secret']),
			matchesLocalFileExclusion(URI.file('/workspace/src/.env.local'), workspaceFolder, ['**/.env.*']),
			matchesLocalFileExclusion(URI.file('/workspace/config/credentials/key.txt'), workspaceFolder, ['**/credentials/**']),
			matchesLocalFileExclusion(URI.file('/workspace/src/token.ts'), workspaceFolder, ['*.secret']),
		]).toEqual([true, true, true, false]);
	});

	test('does not allow negated patterns to re-include files', () => {
		expect(matchesLocalFileExclusion(URI.file('/workspace/allowed.secret'), workspaceFolder, ['*.secret', '!allowed.secret'])).toBe(true);
	});

	test('filters ignored streaming text search results', async () => {
		const ignoredUri = URI.file('/workspace/hidden.secret');
		const visibleUri = URI.file('/workspace/visible.ts');
		const ignoreService: IIgnoreService = {
			...NullIgnoreService.Instance,
			isCopilotIgnored: async uri => uri.toString() === ignoredUri.toString(),
		};
		const results = (async function* () {
			yield { uri: ignoredUri } as never;
			yield { uri: visibleUri } as never;
		})();

		const filtered = [];
		for await (const result of filterIgnoredTextSearchResults(ignoreService, results, CancellationToken.None)) {
			filtered.push(result.uri.toString());
		}

		expect(filtered).toEqual([visibleUri.toString()]);
	});
});
