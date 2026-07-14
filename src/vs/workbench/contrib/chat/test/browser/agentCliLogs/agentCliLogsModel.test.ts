/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { parseCompoundCommand } from '../../../browser/agentCliLogs/agentCliLogsModel.js';

suite('AgentCliLogsModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseCompoundCommand', () => {

		test('single command with no arguments', () => {
			const result = parseCompoundCommand('ls');
			assert.deepStrictEqual(result, {
				cwd: undefined,
				segments: [{ command: 'ls', args: '' }]
			});
		});

		test('single command with arguments', () => {
			const result = parseCompoundCommand('git status --short');
			assert.deepStrictEqual(result, {
				cwd: undefined,
				segments: [{ command: 'git', args: 'status --short' }]
			});
		});

		test('cd followed by command via &&', () => {
			const result = parseCompoundCommand('cd /home/user/project && npm install');
			assert.deepStrictEqual(result, {
				cwd: '/home/user/project',
				segments: [{ command: 'npm', args: 'install' }]
			});
		});

		test('cd followed by multiple commands via &&', () => {
			const result = parseCompoundCommand('cd /path && cmd1 arg1 arg2 && cmd2 arg3 && cmd3');
			assert.deepStrictEqual(result, {
				cwd: '/path',
				segments: [
					{ command: 'cmd1', args: 'arg1 arg2' },
					{ command: 'cmd2', args: 'arg3' },
					{ command: 'cmd3', args: '' },
				]
			});
		});

		test('multiple commands without cd', () => {
			const result = parseCompoundCommand('echo hello && echo world');
			assert.deepStrictEqual(result, {
				cwd: undefined,
				segments: [
					{ command: 'echo', args: 'hello' },
					{ command: 'echo', args: 'world' },
				]
			});
		});

		test('semicolon-separated commands', () => {
			const result = parseCompoundCommand('cmd1 a ; cmd2 b');
			assert.deepStrictEqual(result, {
				cwd: undefined,
				segments: [
					{ command: 'cmd1', args: 'a' },
					{ command: 'cmd2', args: 'b' },
				]
			});
		});

		test('cd with semicolon-separated commands', () => {
			const result = parseCompoundCommand('cd /tmp ; ls -la');
			assert.deepStrictEqual(result, {
				cwd: '/tmp',
				segments: [
					{ command: 'ls', args: '-la' },
				]
			});
		});

		test('empty string', () => {
			const result = parseCompoundCommand('');
			assert.deepStrictEqual(result, {
				cwd: undefined,
				segments: []
			});
		});

		test('whitespace-only string', () => {
			const result = parseCompoundCommand('   ');
			assert.deepStrictEqual(result, {
				cwd: undefined,
				segments: []
			});
		});

		test('cd only (no subsequent commands)', () => {
			const result = parseCompoundCommand('cd /some/path');
			assert.deepStrictEqual(result, {
				cwd: '/some/path',
				segments: []
			});
		});

		test('preserves quoted arguments', () => {
			const result = parseCompoundCommand('grep -r "hello world" src/');
			assert.deepStrictEqual(result, {
				cwd: undefined,
				segments: [{ command: 'grep', args: '-r "hello world" src/' }]
			});
		});

		test('multiple cds uses last one', () => {
			const result = parseCompoundCommand('cd /first && cd /second && cmd1');
			assert.deepStrictEqual(result, {
				cwd: '/second',
				segments: [{ command: 'cmd1', args: '' }]
			});
		});

		test('mixed && and ; delimiters', () => {
			const result = parseCompoundCommand('cd /path && cmd1 ; cmd2 arg');
			assert.deepStrictEqual(result, {
				cwd: '/path',
				segments: [
					{ command: 'cmd1', args: '' },
					{ command: 'cmd2', args: 'arg' },
				]
			});
		});
	});
});
