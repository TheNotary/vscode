/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IChatTerminalToolInvocationData, IChatService } from '../../common/chatService/chatService.js';

const FULL_LOGS_SCHEME = 'agent-cli-full-logs';

export class AgentCliFullLogsContentProvider extends Disposable implements ITextModelContentProvider {

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(FULL_LOGS_SCHEME, this));
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		// The session resource is encoded in the path
		const sessionResourceStr = resource.path.substring(1); // strip leading /
		const sessionResource = URI.parse(sessionResourceStr);

		const model = this.chatService.getSession(sessionResource);
		if (!model) {
			return null;
		}

		const blocks: string[] = [];

		for (const request of model.getRequests()) {
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
				const output = terminalData.terminalCommandOutput?.text ?? '';
				const exitCode = terminalData.terminalCommandState?.exitCode;

				const header = `# Command: ${commandLine}`;
				const exitLine = exitCode !== undefined ? `# Exit code: ${exitCode}` : '# (still running)';
				blocks.push(`${header}\n${exitLine}\n\n${output}`);
			}
		}

		const content = blocks.join('\n#------------\n');
		const languageSelection = this.languageService.createById('log');
		const existing = this.modelService.getModel(resource);
		if (existing) {
			existing.setValue(content);
			return existing;
		}
		return this.modelService.createModel(content, languageSelection, resource);
	}
}
