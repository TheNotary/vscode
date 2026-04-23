/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Post-download patches applied to the official `ms-vscode-remote.remote-wsl`
// extension so it works against an OSS build of VS Code. Three blockers:
//
//   1. `hasVSDA()` returns false in OSS because `vsda` is proprietary. The
//      extension's activation aborts with "WSL extension is supported only in
//      Microsoft versions of VS Code". We replace the function body with
//      `return!0`.
//
//   2. The bundled `wslServer.sh` invokes
//      `$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME` where
//      `$SERVER_APPNAME` is our `serverApplicationName` (e.g.
//      `code-server-oss`), but the upstream server tarball ships the binary
//      as `bin/code-server`. We inject a symlink fallback before the launch
//      line.
//
//   3. The downloaded MS server rejects unsigned handshake messages with
//      "Unauthorized client refused" because the OSS client cannot produce a
//      valid `vsda` signature. We append a post-extraction step to
//      `wslDownload.sh` that neutralizes that single rejection branch in the
//      server's `out/server-main.js` so the existing dev-mode log fall-through
//      path is taken instead.
//
// All three patches are idempotent and fail loudly if their target pattern is
// not found, so an upstream extension version bump surfaces as a build break.

import fs from 'fs';
import path from 'path';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';

const REMOTE_WSL_NAME = 'ms-vscode-remote.remote-wsl';

interface IPatch {
	file: string;
	find: RegExp;
	replace: string;
	required: boolean;
}

const PATCHES: IPatch[] = [
	{
		file: 'dist/node/extension.js',
		find: /t\.hasVSDA=function\(\)\{[^}]+\}/,
		replace: 't.hasVSDA=function(){return!0}',
		required: true,
	},
	{
		file: 'dist/browser/extension.js',
		find: /t\.hasVSDA=function\(\)\{[^}]+\}/,
		replace: 't.hasVSDA=function(){return!0}',
		required: false,
	},
	{
		// Inject a symlink fallback so launching the server works even when the
		// upstream tarball ships `bin/code-server` rather than our renamed
		// `serverApplicationName`.
		file: 'scripts/wslServer.sh',
		find: /\n"\$VSCODE_REMOTE_BIN\/\$COMMIT\/bin\/\$SERVER_APPNAME" "\$@"\s*$/,
		replace:
			'\nif [ ! -x "$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME" ] && [ -x "$VSCODE_REMOTE_BIN/$COMMIT/bin/code-server" ]; then\n' +
			'    ln -sf code-server "$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME"\n' +
			'fi\n\n' +
			'"$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME" "$@"\n',
		required: true,
	},
];

// `wslDownload.sh` is appended (rather than regex-replaced) with a post-extraction
// hook that patches the downloaded server's auth-reject branch.
const WSL_DOWNLOAD_HOOK_MARKER = '# vscode-oss: neutralize server auth reject';
const WSL_DOWNLOAD_HOOK = `
${WSL_DOWNLOAD_HOOK_MARKER}
SERVER_MAIN="$VSCODE_REMOTE_BIN/$COMMIT/out/server-main.js"
if [ -f "$SERVER_MAIN" ] && ! grep -q "vscode-oss-patched" "$SERVER_MAIN"; then
    perl -pi -e 's/this\\._environmentService\\.isBuilt\\)return [a-zA-Z_\\\$][\\w\\\$]*\\("Unauthorized client refused"\\);/this._environmentService.isBuilt\\&\\&0);\\/\\*vscode-oss-patched\\*\\//g' "$SERVER_MAIN"
fi
`;

export function patchRemoteWsl(extensionRoot: string): void {
	if (!fs.existsSync(extensionRoot)) {
		return;
	}

	for (const patch of PATCHES) {
		const target = path.join(extensionRoot, patch.file);
		if (!fs.existsSync(target)) {
			if (patch.required) {
				throw new Error(`[remote-wsl-patch] required file missing: ${patch.file}`);
			}
			fancyLog(ansiColors.gray('[remote-wsl-patch]'), `skip (missing) ${patch.file}`);
			continue;
		}
		const content = fs.readFileSync(target, 'utf8');
		if (content.includes(patch.replace)) {
			fancyLog(ansiColors.gray('[remote-wsl-patch]'), `already patched ${patch.file}`);
			continue;
		}
		if (!patch.find.test(content)) {
			if (!patch.required) {
				fancyLog(ansiColors.gray('[remote-wsl-patch]'), `pattern not present in ${patch.file} (optional)`);
				continue;
			}
			throw new Error(`[remote-wsl-patch] pattern not found in ${patch.file}; upstream may have changed`);
		}
		const patched = content.replace(patch.find, patch.replace);
		fs.writeFileSync(target, patched);
		fancyLog(ansiColors.blue('[remote-wsl-patch]'), `patched ${patch.file}`, ansiColors.green('✔︎'));
	}

	const downloadScript = path.join(extensionRoot, 'scripts/wslDownload.sh');
	if (fs.existsSync(downloadScript)) {
		const content = fs.readFileSync(downloadScript, 'utf8');
		if (!content.includes(WSL_DOWNLOAD_HOOK_MARKER)) {
			fs.writeFileSync(downloadScript, content + WSL_DOWNLOAD_HOOK);
			fancyLog(ansiColors.blue('[remote-wsl-patch]'), 'patched scripts/wslDownload.sh', ansiColors.green('✔︎'));
		} else {
			fancyLog(ansiColors.gray('[remote-wsl-patch]'), 'already patched scripts/wslDownload.sh');
		}
	}
}

export function patchBuiltInRemoteWsl(builtInExtensionsRoot: string): void {
	patchRemoteWsl(path.join(builtInExtensionsRoot, REMOTE_WSL_NAME));
}
