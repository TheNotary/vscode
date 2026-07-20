/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Post-download patches applied to the official `ms-vscode-remote.remote-containers`
// extension so it works against an OSS build of VS Code. The extension checks for
// the proprietary `vsda` module and returns before registering its commands, remote
// authority resolvers, and tree data providers when the module is unavailable. The
// official server downloaded by the extension also rejects the unsigned handshake
// produced by an OSS client.

import fs from 'fs';
import path from 'path';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';

const REMOTE_CONTAINERS_NAME = 'ms-vscode-remote.remote-containers';
const EXTENSION_FILE = 'dist/extension/extension.js';
const ACTIVATION_GUARD = /DevContainersOnlyLicensedForMicrosoftVSCode\(\)\{[^}]+\}/;
const PATCHED_ACTIVATION_GUARD = 'DevContainersOnlyLicensedForMicrosoftVSCode(){return!0}';
const SERVER_LAUNCH_MARKER = 'e.progress(5);let N="Starting VS Code Server"';
const SERVER_PATCH_MARKER = 'vscodeOssServerMain';
const SERVER_PATCH_SCRIPT = `
const fs = require('fs');
const file = process.argv[1];
const content = fs.readFileSync(file, 'utf8');
const marker = '/*vscode-oss-patched*/';
if (!content.includes(marker)) {
	const pattern = /this\\._environmentService\\.isBuilt\\)return [a-zA-Z_\\$][\\w\\$]*\\("Unauthorized client refused"\\);/;
	if (!pattern.test(content)) {
		throw new Error('VS Code Server authentication guard not found');
	}
	fs.writeFileSync(file, content.replace(pattern, 'this._environmentService.isBuilt&&0);/*vscode-oss-patched*/'));
}
`;

function getServerPatchCommand(): string {
	const encodedScript = Buffer.from(SERVER_PATCH_SCRIPT).toString('base64');
	return `let ${SERVER_PATCH_MARKER}=Re.posix.join(l,"out","server-main.js");await (t.launchRootShellServer?await t.launchRootShellServer():f).exec(\`'\${Re.posix.join(l,"node")}' -e 'eval(Buffer.from("${encodedScript}","base64").toString())' '\${${SERVER_PATCH_MARKER}}'\`);`;
}

export function patchRemoteContainers(extensionRoot: string): void {
	if (!fs.existsSync(extensionRoot)) {
		return;
	}

	const target = path.join(extensionRoot, EXTENSION_FILE);
	if (!fs.existsSync(target)) {
		throw new Error(`[remote-containers-patch] required file missing: ${EXTENSION_FILE}`);
	}

	const content = fs.readFileSync(target, 'utf8');
	let patched = content;
	if (patched.includes(PATCHED_ACTIVATION_GUARD)) {
		fancyLog(ansiColors.gray('[remote-containers-patch]'), `already patched ${EXTENSION_FILE}`);
	} else if (!ACTIVATION_GUARD.test(patched)) {
		throw new Error(`[remote-containers-patch] activation guard not found in ${EXTENSION_FILE}; upstream may have changed`);
	} else {
		patched = patched.replace(ACTIVATION_GUARD, PATCHED_ACTIVATION_GUARD);
	}

	if (patched.includes(SERVER_PATCH_MARKER)) {
		fancyLog(ansiColors.gray('[remote-containers-patch]'), `server launch already patched in ${EXTENSION_FILE}`);
	} else if (!patched.includes(SERVER_LAUNCH_MARKER)) {
		throw new Error(`[remote-containers-patch] server launch not found in ${EXTENSION_FILE}; upstream may have changed`);
	} else {
		patched = patched.replace(SERVER_LAUNCH_MARKER, `${getServerPatchCommand()}${SERVER_LAUNCH_MARKER}`);
	}

	if (patched !== content) {
		fs.writeFileSync(target, patched);
		fancyLog(ansiColors.blue('[remote-containers-patch]'), `patched ${EXTENSION_FILE}`, ansiColors.green('done'));
	}
}

export function patchBuiltInRemoteContainers(builtInExtensionsRoot: string): void {
	patchRemoteContainers(path.join(builtInExtensionsRoot, REMOTE_CONTAINERS_NAME));
}
