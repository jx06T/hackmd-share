import { parseYaml, stringifyYaml, App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { shareNote, getNote, updataNote } from 'sharer';

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

function addLinkToYaml(editor: Editor, key: string, link: string) {
	const content = editor.getValue();
	const yamlRegex = /^---\n([\s\S]*?)\n---/;
	let newContent;

	if (yamlRegex.test(content)) {
		newContent = content.replace(yamlRegex, (match, p1) => {
			const yamlData = parseYaml(p1) || {};
			yamlData[key] = link;
			const newYaml = stringifyYaml(yamlData).trim();
			return `---\n${newYaml}\n---`;
		});
	} else {
		const yamlData = {
			[key]: link
		};
		const newYaml = stringifyYaml(yamlData).trim();
		newContent = `---\n${newYaml}\n---\n\n` + content;
	}

	editor.setValue(newContent);
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
			// 關閉其他打開的下拉選單
			document.querySelectorAll('.options-list.show').forEach(list => {
				if (list !== optionsList) {
					list.classList.remove('show');
				}
			});
			optionsList.classList.toggle('show');
		});

		return () => selectedValue; // 返回一個函數用來獲取選中的值
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


		// 創建三個下拉選單
		const getEditValue = this.createDropdown(dropdownContainer, '編輯權限 ：', 'owner', ['owner', 'signed_in', 'guest']);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Push')
					.setCta()
					.onClick(async () => {
						const writePermission = (await getEditValue)();


						// 直接執行分享邏輯
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
								addLinkToYaml(this.editor, "hackmd-link-" + writePermission, link);
								addLinkToYaml(this.editor, "hackmd-id-" + writePermission, id);
							} catch (error) {
								console.log(error);
								new Notice('Push failed: ' + error.message);
							}
						}

						this.close();
					}));

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Pull')
					.setCta()
					.onClick(async () => {
						if (!this.currId) {
							new Notice("No online version");
							return
						}

						const fileContent = this.editor.getValue();
						const match = fileContent.match(/^(---\n[\s\S]*?\n---)/);
						const yaml = match ? match[1] + "\n" : "";
						const content = yaml + this.previewArea.value;

						this.editor.setValue(content)
						const message = `Pull successfully`;
						new Notice(message, 10000).noticeEl;

						this.close();
					}));

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
