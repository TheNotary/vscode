/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * The location at which the chat is happening.
	 */
	export enum ChatLocation {
		/**
		 * The chat panel
		 */
		Panel = 1,
		/**
		 * Terminal inline chat
		 */
		Terminal = 2,
		/**
		 * Notebook inline chat
		 */
		Notebook = 3,
		/**
		 * Code editor inline chat
		 */
		Editor = 4,
	}

	export class ChatRequestEditorData {

		readonly editor: TextEditor;

		//TODO@API should be the editor
		document: TextDocument;
		selection: Selection;

		/** @deprecated */
		wholeRange: Range;

		constructor(editor: TextEditor, document: TextDocument, selection: Selection, wholeRange: Range);
	}

	export class ChatRequestNotebookData {
		//TODO@API should be the editor
		readonly cell: TextDocument;

		constructor(cell: TextDocument);
	}

	export interface ChatRequest {
		/**
		 * The id of the chat request. Used to identity an interaction with any of the chat surfaces.
		 */
		readonly id: string;
		/**
		 * The attempt number of the request. The first request has attempt number 0.
		 */
		readonly attempt: number;

		/**
		 * The session identifier for this chat request.
		 *
		 * @deprecated Use {@link chatSessionResource} instead.
		 */
		readonly sessionId: string;

		/**
		 * The resource URI for the chat session this request belongs to.
		 */
		readonly sessionResource: Uri;

		/**
		 * If automatic command detection is enabled.
		 */
		readonly enableCommandDetection: boolean;

		/**
		 * If the chat participant or command was automatically assigned.
		 */
		readonly isParticipantDetected: boolean;

		/**
		 * The location at which the chat is happening. This will always be one of the supported values
		 *
		 * @deprecated
		 */
		readonly location: ChatLocation;

		/**
		 * Information that is specific to the location at which chat is happening, e.g within a document, notebook,
		 * or terminal. Will be `undefined` for the chat panel.
		 */
		readonly location2: ChatRequestEditorData | ChatRequestNotebookData | undefined;

		/**
		 * Events for edited files in this session collected since the last request.
		 */
		readonly editedFileEvents?: ChatRequestEditedFileEvent[];

		/**
		 * Unique ID for the subagent invocation, used to group tool calls from the same subagent run together.
		 * Pass this to tool invocations when calling tools from within a subagent context.
		 */
		readonly subAgentInvocationId?: string;

		/**
		 * Display name of the subagent that is invoking this request.
		 */
		readonly subAgentName?: string;

		/**
		 * The request ID of the parent request that invoked this subagent.
		 */
		readonly parentRequestId?: string;

		/**
		 * The permission level for tool auto-approval in this request.
		 * - `'autoApprove'`: Auto-approve all tool calls and retry on errors.
		 * - `'autopilot'`: Everything autoApprove does plus continues until the task is done.
		 */
		readonly permissionLevel?: string;

		/**
		 * Whether any hooks are enabled for this request.
		 */
		readonly hasHooksEnabled: boolean;

		/**
		 * When true, this request was initiated by the system (e.g. a terminal
		 * command completion notification) rather than by the user typing a
		 * message. Extensions can use this to render the prompt differently
		 * and skip billing.
		 */
		readonly isSystemInitiated?: boolean;
	}

	export enum ChatRequestEditedFileEventKind {
		Keep = 1,
		Undo = 2,
		UserModification = 3,
	}

	export interface ChatRequestEditedFileEvent {
		readonly uri: Uri;
		readonly eventKind: ChatRequestEditedFileEventKind;
	}

	/**
	 * ChatRequestTurn + private additions. Note- at runtime this is the SAME as ChatRequestTurn and instanceof is safe.
	 */
	export class ChatRequestTurn2 {
		/**
		 * The id of the chat request. Used to identity an interaction with any of the chat surfaces.
		 */
		readonly id?: string;
		/**
		 * The prompt as entered by the user.
		 *
		 * Information about references used in this request is stored in {@link ChatRequestTurn.references}.
		 *
		 * *Note* that the {@link ChatParticipant.name name} of the participant and the {@link ChatCommand.name command}
		 * are not part of the prompt.
		 */
		readonly prompt: string;

		/**
		 * The id of the chat participant to which this request was directed.
		 */
		readonly participant: string;

		/**
		 * The name of the {@link ChatCommand command} that was selected for this request.
		 */
		readonly command?: string;

		/**
		 * The references that were used in this message.
		 */
		readonly references: ChatPromptReference[];

		/**
		 * The list of tools were attached to this request.
		 */
		readonly toolReferences: readonly ChatLanguageModelToolReference[];

		/**
		 * Events for edited files in this session collected between the previous request and this one.
		 */
		readonly editedFileEvents?: ChatRequestEditedFileEvent[];

		/**
		 * The identifier of the language model that was used for this request, if known.
		 */
		readonly modelId?: string;

		/**
		 * The mode instructions that were active for this request, if any.
		 */
		readonly modeInstructions2?: ChatRequestModeInstructions;

		/**
		 * @hidden
		 */
		constructor(prompt: string, command: string | undefined, references: ChatPromptReference[], participant: string, toolReferences: ChatLanguageModelToolReference[], editedFileEvents: ChatRequestEditedFileEvent[] | undefined, id: string | undefined, modelId: string | undefined, modeInstructions2: ChatRequestModeInstructions | undefined);
	}

	export class ChatResponseTurn2 {
		/**
		 * The id of the chat response. Used to identity an interaction with any of the chat surfaces.
		 */
		readonly id?: string;

		/**
		 * The content that was received from the chat participant. Only the stream parts that represent actual content (not metadata) are represented.
		 */
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ExtendedChatResponsePart | ChatToolInvocationPart>;

		/**
		 * The result that was received from the chat participant.
		 */
		readonly result: ChatResult;

		/**
		 * The id of the chat participant that this response came from.
		 */
		readonly participant: string;

		/**
		 * The name of the command that this response came from.
		 */
		readonly command?: string;

		constructor(response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ExtendedChatResponsePart>, result: ChatResult, participant: string);
	}

	export interface ChatParticipant {
		supportIssueReporting?: boolean;
	}

	export enum ChatErrorLevel {
		Info = 0,
		Warning = 1,
		Error = 2,
	}

	export interface ChatErrorDetails {
		/**
		 * If set to true, the message content is completely hidden. Only ChatErrorDetails#message will be shown.
		 */
		responseIsRedacted?: boolean;

		isQuotaExceeded?: boolean;

		isRateLimited?: boolean;

		/**
		 * If true, the error is an expected operational condition (e.g. user-actionable
		 * configuration, network connectivity, missing dependency) and should not be
		 * logged as a `chatAgentError` telemetry event. The error is still surfaced to
		 * the user. Throwing an `Error` whose `name` is `'ChatExpectedError'` from a
		 * chat participant handler will set this flag automatically.
		 */
		isExpectedError?: boolean;

		level?: ChatErrorLevel;

		code?: string;
	}

	export namespace chat {
		export function createDynamicChatParticipant(id: string, dynamicProps: DynamicChatParticipantProps, handler: ChatExtendedRequestHandler): ChatParticipant;
	}

	/**
	 * These don't get set on the ChatParticipant after creation, like other props, because they are typically defined in package.json and we want them at the time of creation.
	 */
	export interface DynamicChatParticipantProps {
		name: string;
		publisherName: string;
		description?: string;
		fullName?: string;
	}

	export namespace lm {
		export function registerIgnoredFileProvider(provider: LanguageModelIgnoredFileProvider): Disposable;
	}

	export interface LanguageModelIgnoredFileProvider {
		provideFileIgnored(uri: Uri, token: CancellationToken): ProviderResult<boolean>;
	}

	export type PreToolUsePermissionDecision = 'allow' | 'deny' | 'ask';

	export interface LanguageModelToolInvocationOptions<T> {
		chatRequestId?: string;
		chatSessionResource?: Uri;
		chatInteractionId?: string;
		terminalCommand?: string;
		/**
		 * The working directory URI for the session, if set.
		 * In the agents window, each session can have its own working directory
		 * that differs from the current workspace folders.
		 */
		workingDirectory?: Uri;
		/**
		 * Unique ID for the subagent invocation, used to group tool calls from the same subagent run together.
		 */
		subAgentInvocationId?: string;
		/**
		 * W3C trace context `traceparent` header value identifying the active distributed
		 * tracing span. When provided to a tool implementation backed by an MCP server, this
		 * value is forwarded as `_meta.traceparent` on the JSON-RPC `tools/call` request so
		 * downstream servers can correlate their spans (MCP SEP-414).
		 */
		traceparent?: string;
		/**
		 * Optional W3C trace context `tracestate` header value paired with `traceparent`.
		 */
		tracestate?: string;
		/**
		 * Pre-tool-use hook result, if the hook was already executed by the caller.
		 * When provided, the tools service will skip executing its own preToolUse hook
		 * and use this result for permission decisions and input modifications instead.
		 */
		preToolUseResult?: {
			permissionDecision?: PreToolUsePermissionDecision;
			permissionDecisionReason?: string;
			updatedInput?: object;
		};
	}

	export interface LanguageModelToolInvocationPrepareOptions<T> {
		/**
		 * The input that the tool is being invoked with.
		 */
		input: T;
		chatRequestId?: string;
		chatSessionResource?: Uri;
		chatInteractionId?: string;
		/**
		 * The working directory URI for the session, if set.
		 * In the agents window, each session can have its own working directory
		 * that differs from the current workspace folders.
		 */
		workingDirectory?: Uri;
		/**
		 * If set, tells the tool that it should include confirmation messages.
		 */
		forceConfirmationReason?: string;
	}

	export interface PreparedToolInvocation {
		pastTenseMessage?: string | MarkdownString;
		presentation?: 'hidden' | 'hiddenAfterComplete' | undefined;
	}

	export class ExtendedLanguageModelToolResult extends LanguageModelToolResult {
		toolResultMessage?: string | MarkdownString;
		toolResultDetails?: Array<Uri | Location>;
		toolMetadata?: unknown;
		/** Whether there was an error calling the tool. The tool may still have partially succeeded. */
		hasError?: boolean;
	}

	// #region Chat participant detection

	export interface ChatParticipantMetadata {
		participant: string;
		command?: string;
		disambiguation: { category: string; description: string; examples: string[] }[];
	}

	export interface ChatParticipantDetectionResult {
		participant: string;
		command?: string;
	}

	export interface ChatParticipantDetectionProvider {
		provideParticipantDetection(chatRequest: ChatRequest, context: ChatContext, options: { participants?: ChatParticipantMetadata[]; location: ChatLocation }, token: CancellationToken): ProviderResult<ChatParticipantDetectionResult>;
	}

	export namespace chat {
		export function registerChatParticipantDetectionProvider(participantDetectionProvider: ChatParticipantDetectionProvider): Disposable;

		export const onDidDisposeChatSession: Event<string>;

		/**
		 * Returns all available chat modes (builtin and custom). Use the
		 * returned {@link ChatAvailableMode.id} or {@link ChatAvailableMode.name}
		 * with {@link AuthorChatMessageOptions.mode} to select a specific mode.
		 */
		export function getAvailableModes(token: CancellationToken): Thenable<readonly ChatAvailableMode[]>;

		/**
		 * An event that fires when the set of available modes changes (e.g.,
		 * a custom `.agent.md` file is added, removed, or modified).
		 */
		export const onDidChangeAvailableModes: Event<void>;
	}

	/**
	 * The kind of a chat mode.
	 */
	export enum ChatModeKind {
		/**
		 * A question-answering mode.
		 */
		Ask = 'ask',
		/**
		 * A code-editing mode.
		 */
		Edit = 'edit',
		/**
		 * An agentic mode.
		 */
		Agent = 'agent',
	}

	/**
	 * Describes an available chat mode that can be used with
	 * {@link window.authorChatMessage} or selected in the mode picker.
	 */
	export interface ChatAvailableMode {
		/**
		 * A stable identifier for this mode. For builtin modes this is
		 * `'ask'`, `'edit'`, or `'agent'`. For custom modes (defined via
		 * `.agent.md` files) this is the URI string of the defining file,
		 * though {@link name} may also be used to reference the mode.
		 */
		readonly id: string;

		/**
		 * The human-readable name of the mode (e.g. `'Ask'`, `'Agent'`,
		 * `'Plan'`). This value can also be passed to
		 * {@link AuthorChatMessageOptions.mode} for resolution.
		 */
		readonly name: string;

		/**
		 * An optional description of what this mode does.
		 */
		readonly description?: string;

		/**
		 * The kind of mode. Builtin modes map directly to their kind.
		 * Custom modes always have kind {@link ChatModeKind.Agent}.
		 */
		readonly kind: ChatModeKind;

		/**
		 * Whether this is a builtin mode (`true` for Ask, Edit, Agent)
		 * or a custom/user-defined mode (`false`).
		 */
		readonly isBuiltin: boolean;
	}

	/**
	 * Options for {@link window.authorChatMessage} that control the message
	 * content, target session, model, agent, and configuration. The
	 * corresponding UI elements (model picker, permission level, etc.) are
	 * updated to reflect the specified values before the message is dispatched.
	 */
	export interface AuthorChatMessageOptions {
		/**
		 * The message text to send.
		 */
		message: string;

		/**
		 * The resource URI of the chat session to target. If `undefined`, a
		 * new chat session is created automatically.
		 */
		sessionResource?: Uri;

		/**
		 * A language model selector. The first matching model will be selected
		 * in the model picker before the message is sent.
		 */
		model?: LanguageModelChatSelector;

		/**
		 * The ID of the chat agent to target. The message will be routed to
		 * this agent without adding an `@` mention to the displayed text.
		 */
		agent?: string;

		/**
		 * The chat mode to select before sending the message. Accepts a mode
		 * ID (e.g. `'ask'`, `'edit'`, `'agent'`) or a mode name (e.g.
		 * `'Plan'`). Use {@link chat.getAvailableModes} to discover available
		 * modes and their identifiers.
		 *
		 * When set, the mode picker in the UI is updated to reflect this mode.
		 * If both {@link mode} and {@link agent} are specified, `mode` controls
		 * the mode picker selection while `agent` routes the message.
		 *
		 * If not set and {@link agent} is specified, defaults to `'agent'` mode.
		 */
		mode?: string;

		/**
		 * The reasoning effort level (e.g. `'low'`, `'medium'`, `'high'`).
		 * Valid values depend on the selected model's configuration schema.
		 */
		reasoningEffort?: string;

		/**
		 * The context size (max input tokens) to use for this request.
		 * Valid values depend on the selected model's configuration schema.
		 */
		contextSize?: number;

		/**
		 * The permission level for tool auto-approval.
		 */
		permissions?: AuthorChatMessagePermissions;
	}

	/**
	 * The permission level for tool auto-approval.
	 */
	export enum AuthorChatMessagePermissions {
		/**
		 * Use existing auto-approve settings.
		 */
		Default = 'default',
		/**
		 * Auto-approve all tool calls and retry on errors.
		 */
		AutoApprove = 'autoApprove',
		/**
		 * Everything AutoApprove does plus continues until the task is done.
		 */
		Autopilot = 'autopilot',
	}

	/**
	 * Describes a language model that was available during an
	 * {@link window.authorChatMessage} call.
	 */
	export interface AuthorChatMessageModelInfo {
		readonly id: string;
		readonly vendor: string;
		readonly family: string;
		readonly version: string;
	}

	/**
	 * Error codes for {@link AuthorChatMessageError}.
	 */
	export enum AuthorChatMessageErrorCode {
		/**
		 * The chat session could not be created or loaded.
		 */
		SessionAcquisitionFailed = 'sessionAcquisitionFailed',
		/**
		 * The chat widget could not be opened or found.
		 */
		WidgetUnavailable = 'widgetUnavailable',
		/**
		 * No model matched the provided selector.
		 */
		ModelNotFound = 'modelNotFound',
		/**
		 * The chat service rejected the send request.
		 */
		RequestRejected = 'requestRejected',
	}

	/**
	 * Error details included in {@link AuthorChatMessageResult.error} when
	 * the message could not be sent.
	 */
	export interface AuthorChatMessageError {
		/**
		 * A machine-readable error code.
		 */
		readonly code: AuthorChatMessageErrorCode;

		/**
		 * A human-readable description of the error.
		 */
		readonly message: string;

		/**
		 * When {@link code} is `'modelNotFound'`, the list of models that were
		 * available at the time of the call. Useful for diagnosing selector mismatches.
		 */
		readonly availableModels?: AuthorChatMessageModelInfo[];
	}

	/**
	 * Result of {@link window.authorChatMessage}. On success,
	 * {@link sessionResource} is the session that was used or created and
	 * {@link error} is `undefined`. On failure, {@link error} contains the
	 * details and {@link sessionResource} is still available when the session
	 * was acquired before the error occurred.
	 */
	export interface AuthorChatMessageResult {
		/**
		 * The resource URI of the chat session that was used or created.
		 * May be `undefined` when the session itself could not be acquired.
		 */
		readonly sessionResource?: Uri;

		/**
		 * Error details if the message could not be sent. `undefined` on
		 * success.
		 */
		readonly error?: AuthorChatMessageError;
	}

	/**
	 * Represents an active chat panel session with live, observable properties.
	 */
	export interface ChatPanelSession {
		/**
		 * The resource URI that uniquely identifies this chat session.
		 */
		readonly resource: Uri;

		/**
		 * The current title of the chat session. Reading this value always
		 * returns the latest title. Setting it updates the session's custom
		 * title, similar to when the system summarizes the initial prompt.
		 */
		title: string;

		/**
		 * Whether a request is currently in progress in this session.
		 */
		readonly requestInProgress: boolean;

		/**
		 * The timestamp (in milliseconds since epoch) of the last message in this session.
		 */
		readonly lastMessageDate: number;
	}

	export namespace window {
		/**
		 * The resource URI of the currently active chat panel session,
		 * or `undefined` if there is no active chat panel session.
		 */
		export const activeChatPanelSessionResource: Uri | undefined;

		/**
		 * The currently active chat panel session, or `undefined` if there
		 * is no active chat panel session. The returned object is live —
		 * its properties always reflect the current state of the session.
		 */
		export const activeChatPanelSession: ChatPanelSession | undefined;

		/**
		 * Opens an existing chat session in the chat panel.
		 *
		 * Returns `true` if the session was opened, otherwise `false`.
		 */
		export function openChatSession(sessionResource: Uri): Thenable<boolean>;

		/**
		 * Sends a message to an existing chat session without requiring
		 * the session to be open or focused in the UI.
		 *
		 * Returns `true` if the message was sent, otherwise `false`.
		 */
		export function sendChatMessage(sessionResource: Uri, message: string): Thenable<boolean>;

		/**
		 * Sends a message to a chat session while also updating the chat panel UI
		 * to reflect the specified parameters (model, agent, reasoning effort, context
		 * size, permissions). The session will be opened/revealed if not already visible.
		 *
		 * If {@link AuthorChatMessageOptions.sessionResource} is omitted, a new chat
		 * session is created automatically.
		 *
		 * On success, the returned {@link AuthorChatMessageResult} contains the
		 * session URI and no error. On failure, {@link AuthorChatMessageResult.error}
		 * contains the details.
		 */
		export function authorChatMessage(options: AuthorChatMessageOptions): Thenable<AuthorChatMessageResult>;

		/**
		 * An event that fires when the active chat panel session resource changes.
		 */
		export const onDidChangeActiveChatPanelSessionResource: Event<Uri | undefined>;

		/**
		 * An event that fires when the active chat panel session changes.
		 */
		export const onDidChangeActiveChatPanelSession: Event<ChatPanelSession | undefined>;
	}

	// #endregion

	// #region ChatErrorDetailsWithConfirmation

	export interface ChatErrorDetails {
		confirmationButtons?: ChatErrorDetailsConfirmationButton[];
	}

	export interface ChatErrorDetailsConfirmationButton {
		data: any;
		label: string;
	}

	// #endregion

	// #region LanguageModelProxyProvider

	/**
	 * Duplicated so that this proposal and languageModelProxy can be independent.
	 */
	export interface LanguageModelProxy extends Disposable {
		readonly uri: Uri;
		readonly key: string;
	}

	export interface LanguageModelProxyProvider {
		provideModelProxy(forExtensionId: string, token: CancellationToken): ProviderResult<LanguageModelProxy>;
	}

	export namespace lm {
		export function registerLanguageModelProxyProvider(provider: LanguageModelProxyProvider): Disposable;
	}

	// #endregion

	// #region Steering

	export interface ChatContext {
		/**
		 * Set to `true` by the editor to request the language model gracefully
		 * stop after its next opportunity. When set, it's likely that the editor
		 * will immediately follow up with a new request in the same conversation.
		 */
		readonly yieldRequested: boolean;

		/**
		 * The resource URI identifying the chat session this context belongs to.
		 * Available when the context is provided for title generation, summarization,
		 * or other session-scoped operations. Extracted from the session's history entries.
		 */
		readonly sessionResource?: Uri;
	}

	// #endregion

	export interface LanguageModelToolInformation {
		/**
		 * The full reference name of this tool as used in agent definition files.
		 */
		readonly fullReferenceName?: string;
	}

	// #region Quota Sync

	/**
	 * A snapshot of quota usage for a single category (chat, completions, premium chat).
	 */
	export interface ChatQuotaSnapshot {
		readonly percentRemaining: number;
		readonly unlimited: boolean;
		readonly hasQuota?: boolean;
		readonly resetAt?: number;
		readonly usageBasedBilling?: boolean;
		readonly entitlement?: number;
		readonly quotaRemaining?: number;
	}

	/**
	 * A snapshot of rate limit usage for a category (session or weekly).
	 */
	export interface ChatRateLimitSnapshot {
		readonly percentRemaining: number;
		readonly unlimited: boolean;
		readonly resetDate?: string;
	}

	/**
	 * Quota snapshot data covering all categories.
	 * Accepted by {@link chat.updateQuotas} for extension-to-core sync.
	 */
	export interface ChatQuotaSnapshots {
		readonly resetDate?: string;
		readonly resetDateHasTime?: boolean;
		readonly usageBasedBilling?: boolean;
		readonly canUpgradePlan?: boolean;
		readonly chat?: ChatQuotaSnapshot;
		readonly completions?: ChatQuotaSnapshot;
		readonly premiumChat?: ChatQuotaSnapshot;
		readonly additionalUsageEnabled?: boolean;
		readonly additionalUsageCount?: number;
		readonly sessionRateLimit?: ChatRateLimitSnapshot;
		readonly weeklyRateLimit?: ChatRateLimitSnapshot;
	}

	export namespace chat {
		/**
		 * Push quota snapshot data from the extension to the core workbench.
		 */
		export function updateQuotas(quotas: ChatQuotaSnapshots): void;
	}

	// #endregion
}
