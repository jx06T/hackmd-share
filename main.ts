import { parseYaml, stringifyYaml, App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { share } from 'sharer';
// 記得重命名這些類和接口！

interface hackmdPluginSettings {
	apiToken: string;
}

const DEFAULT_SETTINGS: hackmdPluginSettings = {
	apiToken: 'None'
}

export default class hackmdPlugin extends Plugin {
	settings: hackmdPluginSettings;

	async onload() {
		await this.loadSettings();

		// 這會添加一個編輯器命令，可以對當前編輯器實例執行一些操作
		this.addCommand({
			id: 'hackmd-share',
			name: 'Share article by HackMD',

			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// 讀取整個檔案的文字
				const fileContent = editor.getValue();
				const title = "# " + view.file?.basename + "\n";
				const content = title + fileContent
				share(this.settings.apiToken, content, "owner").then((response: RequestUrlResponse) => {
					console.log(JSON.stringify(response.json));

					const link = response.json.publishLink
					const message = `Note shared successfully!`;
					const btn = new Notice(message, 10000).noticeEl;
					btn.addEventListener('click', () => {
						window.open(link, '_blank');
					})
					navigator.clipboard.writeText(link)
					// editor.setValue(`HackMD Link: [${link}](${link})\n\n` + editor.getValue());
					addLinkToYaml(editor, "shared link", link)

				}).catch((error) => {
					console.log(error);
				});
			}
		});

		this.addCommand({
			id: 'share',
			name: 'Share article',
			callback: () => {

				new PopWindows(this.app, this.settings.apiToken).open();
			},
		});

		this.addCommand({
			id: 'hackmd-share_E',
			name: 'Share article by HackMD-guest can edit',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const fileContent = editor.getValue();
				const title = "# " + view.file?.basename + "\n";
				const content = title + fileContent

				share(this.settings.apiToken, content, "guest").then((response: RequestUrlResponse) => {
					const link = response.json.publishLink
					const message = `Note shared successfully!`;
					const btn = new Notice(message, 10000).noticeEl;
					btn.addEventListener('click', () => {
						window.open(link, '_blank');
					})
					navigator.clipboard.writeText(link)
					addLinkToYaml(editor, "editable shared link", link)

				}).catch((error) => {
					console.log(error);
				});
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

	constructor(app: App, token: string) {
		super(app);
		this.token = token
	}

	onOpen() {
		const { contentEl } = this;

		this.titleEl.setText('分享設定');

		const dropdownContainer = contentEl.createEl('div', { cls: 'dropdown-container' });

		// 建立一個函數來創建下拉選單，避免重複代碼
		const createDropdown = (labelText: string, defaultValue: string, options: string[]) => {
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

				optionEl.addEventListener('click', () => {
					selectedDisplay.setText(option);
					optionsList.classList.remove('show');
					selectedValue = option;
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

		// 創建三個下拉選單
		const getEditValue = createDropdown('編輯權限：', 'owner', ['owner', 'signed_in', 'guest']);
		const getViewValue = createDropdown('檢視權限：', 'guest', ['owner', 'signed_in', 'guest']);
		const getCommentValue = createDropdown('評論權限：', 'guest', ['disabled', 'forbidden', 'owners', 'signed_in_users', 'everyone']);

		// 點擊外部關閉所有下拉選單
		document.addEventListener('click', () => {
			document.querySelectorAll('.options-list').forEach(list => {
				list.classList.remove('show');
			});
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Share')
					.setCta()
					.onClick(() => {
						const editValue = getEditValue();
						const viewValue = getViewValue();
						const commentValue = getCommentValue();

						new Notice(`設定已更新：\n編輯權限：${editValue}\n檢視權限：${viewValue}\n評論權限：${commentValue}`);
						editorCallback: async (editor: Editor, view: MarkdownView) => {
							const fileContent = editor.getValue();
							const title = "# " + view.file?.basename + "\n";
							const content = title + fileContent

							share(this.token, content, "guest").then((response: RequestUrlResponse) => {
								const link = response.json.publishLink
								const message = `Note shared successfully!`;
								const btn = new Notice(message, 10000).noticeEl;
								btn.addEventListener('click', () => {
									window.open(link, '_blank');
								})
								navigator.clipboard.writeText(link)
								addLinkToYaml(editor, "editable shared link", link)

							}).catch((error) => {
								console.log(error);
							});
						}

						this.close();
					}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty(); // 清空內容
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
	}
}
