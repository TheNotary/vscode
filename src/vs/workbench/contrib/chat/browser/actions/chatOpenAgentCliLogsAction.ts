/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { AgentCliLogsEditorInput } from '../agentCliLogs/agentCliLogsEditorInput.js';
import { IAgentCliLogsEditorOptions } from '../agentCliLogs/agentCliLogsEditor.js';

export function registerChatOpenAgentCliLogsAction() {
	registerAction2(class OpenAgentCliLogsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openAgentCliLogs',
				title: localize2('chat.openAgentCliLogs.label', "Agent CLI Logs"),
				f1: true,
				category: Categories.Developer,
				precondition: ChatContextKeys.enabled,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
					order: 1,
					group: '4_logs'
				}],
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const chatWidgetService = accessor.get(IChatWidgetService);

			// Capture session resource BEFORE opening the editor, while the chat widget still has focus
			const widget = chatWidgetService.lastFocusedWidget;
			const sessionResource = widget?.viewModel?.model.sessionResource;

			const options: IAgentCliLogsEditorOptions = { pinned: true, sessionResource };
			await editorService.openEditor(AgentCliLogsEditorInput.instance, options);
		}
	});
}
