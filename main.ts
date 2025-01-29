import { parseYaml, stringifyYaml, App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { shareNote, getNote, updataNote } from 'sharer';
import { diffLines, Change } from 'diff';

function generateMergeConflictFile(text1: string, text2: string): string {
	// 使用 diffLines 直接比較兩段文本
	const differences: Change[] = diffLines(text1, text2);
	const result: string[] = [];

	let inConflict = false;
	let conflictBlock: {
		original: string[];
		modified: string[];
	} = {
		original: [],
		modified: []
	};

	// 處理每一個差異塊
	differences.forEach((part: Change) => {
		if (part.added || part.removed) {
			if (!inConflict) {
				inConflict = true;
			}

			// 移除尾部的換行符來防止多餘的空行
			const lines: string[] = part.value.replace(/\n$/, '').split('\n');

			if (part.removed) {
				conflictBlock.original.push(...lines);
			} else if (part.added) {
				conflictBlock.modified.push(...lines);
			}
		} else {
			// 如果之前有衝突塊，先輸出衝突
			if (inConflict) {
				if (conflictBlock.original.length > 0 || conflictBlock.modified.length > 0) {
					result.push('/<<<<<<< HEAD');
					result.push(...conflictBlock.original);
					result.push('/=======');
					result.push(...conflictBlock.modified);
					result.push('/>>>>>>>');
				}
				inConflict = false;
				conflictBlock = { original: [], modified: [] };
			}

			// 添加未修改的內容
			const unchangedLines: string[] = part.value.replace(/\n$/, '').split('\n');
			result.push(...unchangedLines);
		}
	});

	// 處理最後可能存在的衝突塊
	if (inConflict && (conflictBlock.original.length > 0 || conflictBlock.modified.length > 0)) {
		result.push('<<<<<<< HEAD');
		result.push(...conflictBlock.original);
		result.push('=======');
		result.push(...conflictBlock.modified);
		result.push('>>>>>>>');
	}

	return result.join('\n');
}

interface hackmdPluginSettings {
	apiToken: string;
	commentPermission: string;
	readPermission: string;

}
const DEFAULT_SETTINGS: hackmdPluginSettings = {
	apiToken: 'None',
	commentPermission: 'guest',
	readPermission: 'guest',
}

export default class hackmdPlugin extends Plugin {
	settings: hackmdPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'share',
			name: 'Share article',
			editorCallback: async (editor: Editor, view: MarkdownView) => {

				const curContent = editor.getValue();
				const yamlRegex = /^---\n([\s\S]*?)\n---/;
				const match = curContent.match(yamlRegex);

				if (match) {
					const yamlContent = match[1];
					const yamlData = parseYaml(yamlContent);

					new PopWindows(this.app, this.settings, editor, view, yamlData).open();
					return
				}
				new PopWindows(this.app, this.settings, editor, view, {}).open();
			}
		});

		// 這會添加一個設置選項卡，以便用戶可以配置插件的各個方面
		this.addSettingTab(new SettingTab(this.app, this));

		// 如果插件掛接了任何全局 DOM 事件（在應用程序中不屬於此插件的部分）
		// 使用此函數將在插件被禁用時自動刪除事件監聽器。
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click禁用', evt);
		// });
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

function updateYamlContent(content: string, updates: Record<string, any>): string {
	const yamlRegex = /^---\n([\s\S]*?)\n---/;

	if (yamlRegex.test(content)) {
		return content.replace(yamlRegex, (match, p1) => {
			const yamlData = parseYaml(p1) || {};
			Object.assign(yamlData, updates);
			const newYaml = stringifyYaml(yamlData).trim();
			return `---\n${newYaml}\n---`;
		});
	} else {
		const newYaml = stringifyYaml(updates).trim();
		return `---\n${newYaml}\n---\n\n${content}`;
	}
}

function updateEditorYaml(editor: Editor, updates: Record<string, any>): void {
	const content = editor.getValue();
	const newContent = updateYamlContent(content, updates);
	editor.setValue(newContent);
}

async function createRemoteVersionFile(
	app: any,
	folderPath: string,
	originalFileName: string,
	content: string,
	remoteInfo: {
		permission: string;
		pullTime: string;
	}
): Promise<TFile | null> {
	try {
		// 生成新檔名，包含遠端版本信息
		const fileExtension = originalFileName.split('.').pop();
		const baseName = originalFileName.replace(`.${fileExtension}`, '');
		const newFileName = `${baseName}-${remoteInfo.permission}.${fileExtension}`;
		const fullPath = `${folderPath}/${newFileName}`;

		// 添加 YAML front matter
		const yamlUpdates = {
			remote_permission: remoteInfo.permission,
			pull_time: remoteInfo.pullTime,
		};
		const contentWithYaml = updateYamlContent(content, yamlUpdates);

		// 創建新檔案
		const file = await app.vault.create(fullPath, contentWithYaml);
		return file;
	} catch (error) {
		new Notice(`Failed to create remote version file: ${error.message}`);
		return null;
	}
}

class PopWindows extends Modal {
	token: string;
	currId: string;
	settings: hackmdPluginSettings;
	editor: Editor;
	view: MarkdownView;
	idLabel: HTMLElement;
	previewArea: HTMLTextAreaElement;
	yamlData: { [key: string]: string };

	constructor(app: App, settings: hackmdPluginSettings, editor: Editor, view: MarkdownView, yamlData: { [key: string]: string }) {
		super(app);
		this.token = settings.apiToken;
		this.editor = editor;
		this.view = view;
		this.yamlData = yamlData;
		this.settings = settings;
		this.currId = '';

	}

	checkNote = async (noteId: string) => {
		if (noteId) {
			try {
				const response = await getNote(this.token, noteId);
				const content = response.json.content;
				this.previewArea.setText(content)
				this.previewArea.value = content
				this.idLabel.setText(noteId);
				this.currId = noteId;

			} catch (error) {
				this.idLabel.setText('無效的 ID');
				this.previewArea.setText('')
				this.previewArea.value = ''
				this.currId = '';

				new Notice(`無法獲取筆記: ${error.message}`);
			}
		} else {
			this.idLabel.setText('無');
			this.currId = "";
			this.previewArea.value = ''
			this.previewArea.setText('')
		}
	}

	createDropdown = async (dropdownContainer: HTMLDivElement, labelText: string, defaultValue: string, options: string[]) => {
		const noteId = this.yamlData[`hackmd-id-owner`];
		await this.checkNote(noteId)

		const wrapper = dropdownContainer.createEl('div', { cls: 'dropdown-wrapper' });
		wrapper.createEl('label', { text: labelText, cls: 'dropdown-label' });

		const customSelect = wrapper.createEl('div', { cls: 'custom-select' });
		const selectedDisplay = customSelect.createEl('div', {
			cls: 'selected-option',
			text: defaultValue
		});
		const optionsList = customSelect.createEl('div', { cls: 'options-list' });

		let selectedValue = defaultValue;
		options.forEach(option => {
			const optionEl = optionsList.createEl('div', {
				cls: 'option',
				text: option
			});

			optionEl.addEventListener('click', async () => {
				selectedDisplay.setText(option);
				optionsList.classList.remove('show');
				selectedValue = option;

				const noteId = this.yamlData[`hackmd-id-${option}`];
				await this.checkNote(noteId)
			});
		});

		selectedDisplay.addEventListener('click', (e) => {
			e.stopPropagation();
			document.querySelectorAll('.options-list.show').forEach(list => {
				if (list !== optionsList) {
					list.classList.remove('show');
				}
			});
			optionsList.classList.toggle('show');
		});

		return () => selectedValue;
	};

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText('分享設定');

		const dropdownContainer = contentEl.createEl('div', { cls: 'dropdown-container' });
		dropdownContainer.createEl('label', { text: "前次分享 id ：", cls: 'id-a' });
		this.idLabel = dropdownContainer.createEl('label', {
			text: '無',
			cls: 'id-a id-s'
		});
		this.previewArea = dropdownContainer.createEl('textarea', { cls: "preview-area", attr: { rows: "10" } });

		const getEditValue = this.createDropdown(dropdownContainer, '編輯權限 ：', 'owner', ['owner', 'signed_in', 'guest']);

		// push
		new Setting(contentEl)
			.setName('分享')
			.setDesc('若已經分享過則會強制覆蓋線上版本')
			.addButton((btn) =>
				btn
					.setButtonText('Push')
					.setCta()
					.onClick(async () => {
						const writePermission = (await getEditValue)();

						const fileContent = this.editor.getValue();
						const title = "# " + this.view.file?.basename + "\n";
						const contentWithoutYaml = fileContent.replace(/^---\n[\s\S]*?\n---\n/, '');
						const content = title + contentWithoutYaml;

						if (this.currId) {

							try {
								const response = await updataNote(this.token, content, this.currId);
								const message = `Note shared（Updata） successfully!`;
								new Notice(message, 10000).noticeEl;

							} catch (error) {
								console.log(error);
								new Notice('Push（Updata）failed: ' + error.message);
							}

						} else {
							try {
								const response = await shareNote(this.token, content, { writePermission, readPermission: this.settings.readPermission, commentPermission: this.settings.commentPermission });

								const link = response.json.publishLink;
								const id = response.json.id;

								const message = `Note shared successfully!`;
								const btn = new Notice(message, 10000).noticeEl;

								btn.addEventListener('click', () => {
									window.open(link, '_blank');
								});

								await navigator.clipboard.writeText(link);

								updateEditorYaml(this.editor, {
									["hackmd-link-" + writePermission]: link,
									["hackmd-id-" + writePermission]: id
								});

							} catch (error) {
								console.log(error);
								new Notice('Push failed: ' + error.message);
							}
						}

						this.close();
					}));
		// pull
		new Setting(contentEl)
			.setName('合併')
			.setDesc('透過上方預覽框修改後按下 Pull 會合併至本地文件並保留合併衝突')
			.addButton((btn) =>
				btn
					.setButtonText('Pull')
					.setCta()
					.onClick(async () => {
						if (!this.currId) {
							new Notice("No online version");
							return
						}

						const oldContent = this.editor.getValue();
						const oldContentWithoutYaml = oldContent.replace(/^---\n[\s\S]*?\n---\n/, '');
						const match = oldContent.match(/^(---\n[\s\S]*?\n---)/);
						const yaml = match ? match[1] + "\n" : "";

						const newContent = this.previewArea.value;

						const content = generateMergeConflictFile(oldContentWithoutYaml, newContent)

						this.editor.setValue(yaml + content)
						const message = `Pull successfully`;
						new Notice(message, 10000).noticeEl;

						this.close();
					}));

		// pull-f
		new Setting(contentEl)
			.setName('強制合併')
			.setDesc('透過上方預覽框修改後按下 Pull 會強制覆蓋本地文件')
			.addButton((btn) =>
				btn
					.setButtonText('Pull')
					.setCta()
					.onClick(async () => {
						if (!this.currId) {
							new Notice("No online version");
							return
						}

						const oldContent = this.editor.getValue();
						const match = oldContent.match(/^(---\n[\s\S]*?\n---)/);
						const yaml = match ? match[1] + "\n" : "";
						const newContent = this.previewArea.value;

						this.editor.setValue(yaml + newContent)

						const message = `Pull successfully`;
						new Notice(message, 10000).noticeEl;

						this.close();
					}));

		new Setting(contentEl)
			.setName('拉取到新檔案')
			.setDesc('透過上方預覽框修改後按下 Pull 會拉取遠端版本並在當前目錄建立新檔案')
			.addButton((btn) =>
				btn
					.setButtonText('Pull')
					.setCta()
					.onClick(async () => {
						if (!this.currId) {
							new Notice("No online version");
							return;
						}
						const writePermission = (await getEditValue)();

						const oldContent = this.editor.getValue();
						const match = oldContent.match(/^(---\n[\s\S]*?\n---)/);
						const yaml = match ? match[1] + "\n" : "";
						const newContent = this.previewArea.value;

						const currentFile = this.app.workspace.getActiveFile();
						if (!currentFile) {
							new Notice("No active file");
							return;
						}

						const remoteInfo = {
							permission: writePermission,
							pullTime: new Date().toISOString().replace("T", " ").replace(/:/g, ".")
						};

						const newFile = await createRemoteVersionFile(
							this.app,
							currentFile.parent!.path,
							currentFile.name,
							yaml + newContent,
							remoteInfo
						);

						if (newFile) {
							new Notice(`Created remote version file: ${newFile.name}`, 5000);
						}

						this.close();
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SettingTab extends PluginSettingTab {
	plugin: hackmdPlugin;

	constructor(app: App, plugin: hackmdPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName('hackmd api token')
			.setDesc('去搞一個吧')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.apiToken)
				.onChange(async (value) => {
					this.plugin.settings.apiToken = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('commentPermission')
			.setDesc('評論設定')
			.addDropdown(dropdown =>
				dropdown
					.addOptions({
						'disabled': '關閉',
						'forbidden': '禁用',
						'owner': '僅擁有者',
						'signed_in': '登入用戶',
						'guest': '訪客'
					})
					.setValue(this.plugin.settings.commentPermission || 'guest') // 設定預設值
					.onChange(async (value) => {
						this.plugin.settings.commentPermission = value; // 更新選項值
						await this.plugin.saveSettings(); // 儲存設定
					}));

		new Setting(containerEl)
			.setName('readPermission')
			.setDesc('檢視設定')
			.addDropdown(dropdown =>
				dropdown
					.addOptions({
						'owner': '僅擁有者',
						'signed_in': '登入用戶',
						'guest': '訪客'
					})
					.setValue(this.plugin.settings.commentPermission || 'guest') // 設定預設值
					.onChange(async (value) => {
						this.plugin.settings.commentPermission = value; // 更新選項值
						await this.plugin.saveSettings(); // 儲存設定
					}));
	}
}
