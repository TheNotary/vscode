/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { patchRemoteContainers } from '../patchRemoteContainers.ts';

suite('Dev Containers built-in patch', () => {
	let extensionRoot: string;

	beforeEach(() => {
		extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-containers-patch-test-'));
	});

	afterEach(() => {
		fs.rmSync(extensionRoot, { recursive: true, force: true });
	});

	test('patches the activation guard and server launch idempotently', () => {
		const extensionFile = createExtensionFile('before DevContainersOnlyLicensedForMicrosoftVSCode(){var e;return uz(e)} e.progress(5);let N="Starting VS Code Server" after');

		patchRemoteContainers(extensionRoot);
		const firstPatch = fs.readFileSync(extensionFile, 'utf8');
		patchRemoteContainers(extensionRoot);

		assert.deepStrictEqual({
			activationPatched: firstPatch.includes('DevContainersOnlyLicensedForMicrosoftVSCode(){return!0}'),
			serverLaunchPatched: firstPatch.includes('vscodeOssServerMain'),
			usesRootShellWhenAvailable: firstPatch.includes('(t.launchRootShellServer?await t.launchRootShellServer():f).exec'),
			isIdempotent: fs.readFileSync(extensionFile, 'utf8') === firstPatch,
		}, {
			activationPatched: true,
			serverLaunchPatched: true,
			usesRootShellWhenAvailable: true,
			isIdempotent: true,
		});
	});

	test('embedded server patch disables the built-server rejection idempotently', () => {
		const extensionFile = createExtensionFile('DevContainersOnlyLicensedForMicrosoftVSCode(){var e;return uz(e)} e.progress(5);let N="Starting VS Code Server"');
		patchRemoteContainers(extensionRoot);
		const extensionContent = fs.readFileSync(extensionFile, 'utf8');
		const encodedScript = /eval\(Buffer\.from\("([^"]+)","base64"\)\.toString\(\)\)/.exec(extensionContent)?.[1];
		assert.ok(encodedScript);

		const serverFile = path.join(extensionRoot, 'server-main.js');
		fs.writeFileSync(serverFile, 'before this._environmentService.isBuilt)return reject("Unauthorized client refused"); after');
		const executePatch = () => execFileSync(process.execPath, ['-e', `eval(Buffer.from("${encodedScript}","base64").toString())`, serverFile]);
		executePatch();
		const firstPatch = fs.readFileSync(serverFile, 'utf8');
		executePatch();

		assert.deepStrictEqual({
			firstPatch,
			secondPatch: fs.readFileSync(serverFile, 'utf8'),
		}, {
			firstPatch: 'before this._environmentService.isBuilt&&0);/*vscode-oss-patched*/ after',
			secondPatch: 'before this._environmentService.isBuilt&&0);/*vscode-oss-patched*/ after',
		});
	});

	test('fails when the extension entrypoint is missing', () => {
		assert.throws(
			() => patchRemoteContainers(extensionRoot),
			/required file missing: dist\/extension\/extension\.js/
		);
	});

	test('fails when the activation guard changes', () => {
		createExtensionFile('DevContainersOnlyLicensedForMicrosoftVSCode = changedUpstreamImplementation;e.progress(5);let N="Starting VS Code Server"');

		assert.throws(
			() => patchRemoteContainers(extensionRoot),
			/activation guard not found in dist\/extension\/extension\.js/
		);
	});

	test('fails when the server launch changes', () => {
		createExtensionFile('DevContainersOnlyLicensedForMicrosoftVSCode(){var e;return uz(e)}');

		assert.throws(
			() => patchRemoteContainers(extensionRoot),
			/server launch not found in dist\/extension\/extension\.js/
		);
	});

	function createExtensionFile(content: string): string {
		const extensionFile = path.join(extensionRoot, 'dist', 'extension', 'extension.js');
		fs.mkdirSync(path.dirname(extensionFile), { recursive: true });
		fs.writeFileSync(extensionFile, content);
		return extensionFile;
	}
});
