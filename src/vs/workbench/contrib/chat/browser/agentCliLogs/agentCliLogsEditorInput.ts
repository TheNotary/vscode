/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

const agentCliLogsEditorIcon = registerIcon('agent-cli-logs-editor-label-icon', Codicon.terminal, localize('agentCliLogsEditorLabelIcon', 'Icon of the agent CLI logs editor label.'));

export class AgentCliLogsEditorInput extends EditorInput {

	static readonly ID = 'workbench.editor.agentCliLogs';

	static readonly RESOURCE = URI.from({
		scheme: 'agent-cli-logs',
		path: 'default'
	});

	private static _instance: AgentCliLogsEditorInput;
	static get instance() {
		if (!AgentCliLogsEditorInput._instance || AgentCliLogsEditorInput._instance.isDisposed()) {
			AgentCliLogsEditorInput._instance = new AgentCliLogsEditorInput();
		}
		return AgentCliLogsEditorInput._instance;
	}

	override get typeId(): string { return AgentCliLogsEditorInput.ID; }

	override get editorId(): string | undefined { return AgentCliLogsEditorInput.ID; }

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }

	readonly resource = AgentCliLogsEditorInput.RESOURCE;

	override getName(): string {
		return localize('agentCliLogsInputName', "Agent CLI Logs");
	}

	override getIcon(): ThemeIcon {
		return agentCliLogsEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof AgentCliLogsEditorInput;
	}
}

export class AgentCliLogsEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): EditorInput {
		return AgentCliLogsEditorInput.instance;
	}
}
