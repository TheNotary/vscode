/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { IChatTerminalToolInvocationData, IChatToolInvocation } from '../../common/chatService/chatService.js';
import { IChatModel } from '../../common/model/chatModel.js';

export interface IAgentCliCommand {
	readonly command: string;
	readonly args: string;
	readonly failed: boolean;
	readonly groupId: string;
	readonly groupIndex: number;
	readonly rawOutput?: string;
}

export interface IAgentCliCommandGroup {
	readonly groupId: string;
	readonly cwd?: string;
	readonly commands: IAgentCliCommand[];
	readonly rawOutput: string;
}

/**
 * Parses a compound command string (joined by `&&` or `;`) into individual
 * command segments. Leading `cd <path>` segments are extracted as the working
 * directory rather than being included as commands.
 */
export function parseCompoundCommand(raw: string): { cwd?: string; segments: { command: string; args: string }[] } {
	const parts = raw.split(/\s*&&\s*|\s*;\s*/);
	let cwd: string | undefined;
	const segments: { command: string; args: string }[] = [];

	for (const part of parts) {
		const trimmed = part.trim();
		if (!trimmed) {
			continue;
		}

		const cdMatch = trimmed.match(/^cd\s+(.+)$/);
		if (cdMatch) {
			cwd = cdMatch[1].trim();
			continue;
		}

		const firstSpace = trimmed.indexOf(' ');
		if (firstSpace === -1) {
			segments.push({ command: trimmed, args: '' });
		} else {
			segments.push({
				command: trimmed.substring(0, firstSpace),
				args: trimmed.substring(firstSpace + 1),
			});
		}
	}

	return { cwd, segments };
}

export class AgentCliLogsModel extends Disposable {

	private readonly _groups = observableValue<IAgentCliCommandGroup[]>(this, []);

	get groups(): IObservable<IAgentCliCommandGroup[]> {
		return this._groups;
	}

	constructor(private readonly _chatModel: IChatModel) {
		super();

		this._recompute();
		this._register(this._chatModel.onDidChange(() => this._recompute()));
	}

	private _recompute(): void {
		const groups: IAgentCliCommandGroup[] = [];

		for (const request of this._chatModel.getRequests()) {
			const response = request.response;
			if (!response) {
				continue;
			}

			for (const part of response.response.value) {
				if (part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') {
					continue;
				}

				const data = part.toolSpecificData;
				if (!data || data.kind !== 'terminal') {
					continue;
				}

				const terminalData = data as IChatTerminalToolInvocationData;
				const commandLine = terminalData.commandLine.forDisplay ?? terminalData.commandLine.original;
				const exitCode = terminalData.terminalCommandState?.exitCode;
				const rawOutput = terminalData.terminalCommandOutput?.text ?? '';
				const groupId = part.toolCallId;

				const failed = exitCode !== undefined && exitCode !== 0;

				// Determine if the tool invocation is still running
				let isRunning = false;
				if (part.kind === 'toolInvocation') {
					const state = (part as IChatToolInvocation).state.get();
					isRunning = state.type !== IChatToolInvocation.StateKind.Completed
						&& state.type !== IChatToolInvocation.StateKind.Cancelled;
				}

				const { cwd, segments } = parseCompoundCommand(commandLine);
				const commands: IAgentCliCommand[] = [];

				for (let i = 0; i < segments.length; i++) {
					const seg = segments[i];
					// In a `&&` chain that failed, only the last command is marked failed
					// (earlier commands succeeded since `&&` short-circuits on failure).
					// If still running, nothing is marked failed yet.
					const commandFailed = !isRunning && failed && i === segments.length - 1;
					commands.push({
						command: seg.command,
						args: seg.args,
						failed: commandFailed,
						groupId,
						groupIndex: i,
						rawOutput: i === segments.length - 1 ? rawOutput : undefined,
					});
				}

				// If no segments were parsed (e.g. command was just `cd /path`), add a
				// single entry so the group still appears.
				if (commands.length === 0 && cwd) {
					commands.push({
						command: 'cd',
						args: cwd,
						failed,
						groupId,
						groupIndex: 0,
						rawOutput,
					});
				}

				groups.push({ groupId, cwd, commands, rawOutput });
			}
		}

		transaction(tx => {
			this._groups.set(groups, tx);
		});
	}
}
