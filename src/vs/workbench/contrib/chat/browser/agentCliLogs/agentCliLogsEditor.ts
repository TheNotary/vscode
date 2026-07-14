/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { ITableRenderer, ITableVirtualDelegate } from '../../../../../base/browser/ui/table/table.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchTableOptions, WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatWidgetService } from '../chat.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AgentCliLogsEditorInput } from './agentCliLogsEditorInput.js';
import { AgentCliLogsModel, IAgentCliCommand, IAgentCliCommandGroup } from './agentCliLogsModel.js';
import './media/agentCliLogs.css';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

export interface IAgentCliLogsEditorOptions extends IEditorOptions {
	readonly sessionResource?: URI;
}

const $ = DOM.$;

// --- Table row types ---

interface ICliTableGroupHeader {
	readonly kind: 'groupHeader';
	readonly cwd: string;
	readonly groupId: string;
}

interface ICliTableCommand {
	readonly kind: 'command';
	readonly data: IAgentCliCommand;
}

type CliTableItem = ICliTableGroupHeader | ICliTableCommand;

// --- Virtual delegate ---

class CliTableVirtualDelegate implements ITableVirtualDelegate<CliTableItem> {
	readonly headerRowHeight = 24;

	getHeight(item: CliTableItem): number {
		return item.kind === 'groupHeader' ? 28 : 24;
	}
}

// --- Column renderers ---

interface IStatusCellTemplateData {
	readonly icon: HTMLElement;
	readonly disposables: DisposableStore;
}

class CliStatusColumnRenderer implements ITableRenderer<CliTableItem, IStatusCellTemplateData> {
	static readonly TEMPLATE_ID = 'cli-status';
	readonly templateId = CliStatusColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IStatusCellTemplateData {
		const cell = DOM.append(container, $('.cli-status-cell'));
		const icon = DOM.append(cell, $(''));
		return { icon, disposables: new DisposableStore() };
	}

	renderElement(element: CliTableItem, index: number, templateData: IStatusCellTemplateData): void {
		templateData.disposables.clear();
		if (element.kind === 'groupHeader') {
			templateData.icon.className = `codicon ${ThemeIcon.asClassName(Codicon.folder)}`;
			return;
		}
		if (element.data.failed) {
			templateData.icon.className = `codicon ${ThemeIcon.asClassName(Codicon.error)}`;
		} else {
			templateData.icon.className = `codicon ${ThemeIcon.asClassName(Codicon.pass)}`;
		}
	}

	disposeTemplate(templateData: IStatusCellTemplateData): void {
		templateData.disposables.dispose();
	}
}

interface ITextCellTemplateData {
	readonly text: HTMLElement;
	readonly disposables: DisposableStore;
}

class CliCommandColumnRenderer implements ITableRenderer<CliTableItem, ITextCellTemplateData> {
	static readonly TEMPLATE_ID = 'cli-command';
	readonly templateId = CliCommandColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ITextCellTemplateData {
		const text = DOM.append(container, $('.cli-command-cell'));
		return { text, disposables: new DisposableStore() };
	}

	renderElement(element: CliTableItem, index: number, templateData: ITextCellTemplateData): void {
		templateData.disposables.clear();
		if (element.kind === 'groupHeader') {
			templateData.text.classList.add('cli-group-header');
			templateData.text.textContent = element.cwd;
			return;
		}
		templateData.text.classList.remove('cli-group-header');
		if (element.data.failed) {
			templateData.text.classList.add('cli-row-error');
		} else {
			templateData.text.classList.remove('cli-row-error');
		}
		templateData.text.textContent = element.data.command;
	}

	disposeTemplate(templateData: ITextCellTemplateData): void {
		templateData.disposables.dispose();
	}
}

class CliArgsColumnRenderer implements ITableRenderer<CliTableItem, ITextCellTemplateData> {
	static readonly TEMPLATE_ID = 'cli-args';
	readonly templateId = CliArgsColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ITextCellTemplateData {
		const text = DOM.append(container, $('.cli-args-cell'));
		return { text, disposables: new DisposableStore() };
	}

	renderElement(element: CliTableItem, index: number, templateData: ITextCellTemplateData): void {
		templateData.disposables.clear();
		if (element.kind === 'groupHeader') {
			templateData.text.textContent = '';
			return;
		}
		if (element.data.failed) {
			templateData.text.classList.add('cli-row-error');
		} else {
			templateData.text.classList.remove('cli-row-error');
		}
		templateData.text.textContent = element.data.args;
	}

	disposeTemplate(templateData: ITextCellTemplateData): void {
		templateData.disposables.dispose();
	}
}

// --- Editor pane ---

export class AgentCliLogsEditor extends EditorPane {

	static readonly ID = AgentCliLogsEditorInput.ID;

	private container!: HTMLElement;
	private table: WorkbenchTable<CliTableItem> | undefined;
	private readonly modelRef = this._register(new MutableDisposable<AgentCliLogsModel>());
	private readonly modelListeners = this._register(new DisposableStore());
	private emptyLabel: HTMLElement | undefined;
	private sessionResource: URI | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(AgentCliLogsEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = DOM.append(parent, $('.cli-logs-editor'));

		// Header
		const header = DOM.append(this.container, $('.cli-logs-header'));
		DOM.append(header, $('.cli-logs-title')).textContent = localize('agentCliLogs.title', "Agent CLI Logs");

		const openFullLogsButton = this._register(new Button(header, { ...defaultButtonStyles, secondary: true }));
		openFullLogsButton.label = localize('agentCliLogs.openFullLogs', "Open Full Logs");
		this._register(openFullLogsButton.onDidClick(() => this.openFullLogs()));

		// Table container
		const tableContainer = DOM.append(this.container, $('.cli-logs-table'));

		// Empty state
		this.emptyLabel = DOM.append(this.container, $('.cli-logs-empty'));
		this.emptyLabel.textContent = localize('agentCliLogs.empty', "No terminal commands have been run in this session.");

		// Create table
		const columns = [
			{
				label: '',
				tooltip: localize('agentCliLogs.statusTooltip', "Status"),
				weight: 0,
				minimumWidth: 36,
				maximumWidth: 36,
				templateId: CliStatusColumnRenderer.TEMPLATE_ID,
				project: (row: CliTableItem): CliTableItem => row,
			},
			{
				label: localize('agentCliLogs.commandColumn', "Command"),
				tooltip: '',
				weight: 2,
				minimumWidth: 100,
				templateId: CliCommandColumnRenderer.TEMPLATE_ID,
				project: (row: CliTableItem): CliTableItem => row,
			},
			{
				label: localize('agentCliLogs.argsColumn', "Arguments"),
				tooltip: '',
				weight: 3,
				minimumWidth: 100,
				templateId: CliArgsColumnRenderer.TEMPLATE_ID,
				project: (row: CliTableItem): CliTableItem => row,
			},
		];

		const renderers = [
			new CliStatusColumnRenderer(),
			new CliCommandColumnRenderer(),
			new CliArgsColumnRenderer(),
		];

		const options: IWorkbenchTableOptions<CliTableItem> = {
			horizontalScrolling: false,
		};

		this.table = this._register(this.instantiationService.createInstance(
			WorkbenchTable<CliTableItem>,
			'AgentCliLogs',
			tableContainer,
			new CliTableVirtualDelegate(),
			columns,
			renderers,
			options,
		) as WorkbenchTable<CliTableItem>);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		const cliOptions = options as IAgentCliLogsEditorOptions | undefined;
		if (cliOptions?.sessionResource) {
			this.sessionResource = cliOptions.sessionResource;
		} else {
			// Fallback: try to get it from the widget (may work if called while chat has focus)
			this.sessionResource = this.chatWidgetService.lastFocusedWidget?.viewModel?.model.sessionResource;
		}

		this.connectToSession();
	}

	private connectToSession(): void {
		this.modelListeners.clear();

		const chatModel = this.sessionResource
			? this.chatService.getSession(this.sessionResource)
			: undefined;

		if (!chatModel) {
			this.updateTable([]);
			return;
		}

		const model = new AgentCliLogsModel(chatModel);
		this.modelRef.value = model;

		this.modelListeners.add(autorun(reader => {
			const groups = model.groups.read(reader);
			this.updateTable(groups);
		}));
	}

	private updateTable(groups: IAgentCliCommandGroup[]): void {
		if (!this.table) {
			return;
		}

		const items: CliTableItem[] = [];
		for (const group of groups) {
			if (group.cwd) {
				items.push({ kind: 'groupHeader', cwd: group.cwd, groupId: group.groupId });
			}
			for (const cmd of group.commands) {
				items.push({ kind: 'command', data: cmd });
			}
		}

		const hasItems = items.length > 0;
		this.table.splice(0, this.table.length, items);
		this.emptyLabel?.classList.toggle('hidden', hasItems);
		this.table.domNode.classList.toggle('hidden', !hasItems);
	}

	private openFullLogs(): void {
		if (!this.sessionResource) {
			return;
		}
		const uri = URI.from({
			scheme: 'agent-cli-full-logs',
			authority: 'session',
			path: `/${this.sessionResource.toString()}`
		});
		this.editorService.openEditor({ resource: uri, options: { pinned: true } });
	}

	override layout(dimension: DOM.Dimension): void {
		this.table?.layout(dimension.height - 44 /* header height */, dimension.width);
	}

	override focus(): void {
		super.focus();
		this.table?.domFocus();
	}
}
