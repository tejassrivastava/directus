<template>
	<div class="wysiwyg" :class="{ disabled }">
		<editor
			ref="editorElement"
			v-model="internalValue"
			:init="editorOptions"
			:disabled="disabled"
			model-events="change keydown blur focus paste ExecCommand SetContent"
			@focusin="setFocus(true)"
			@focusout="setFocus(false)"
		/>

		<v-dialog v-model="linkDrawerOpen">
			<v-card>
				<v-card-title class="card-title">{{ t('wysiwyg_options.link') }}</v-card-title>
				<v-card-text>
					<div class="grid">
						<div class="field">
							<div class="type-label">{{ t('url') }}</div>
							<v-input v-model="linkSelection.url" :placeholder="t('url_placeholder')"></v-input>
						</div>
						<div class="field">
							<div class="type-label">{{ t('display_text') }}</div>
							<v-input v-model="linkSelection.displayText" :placeholder="t('display_text_placeholder')"></v-input>
						</div>
						<div class="field half">
							<div class="type-label">{{ t('tooltip') }}</div>
							<v-input v-model="linkSelection.title" :placeholder="t('tooltip_placeholder')"></v-input>
						</div>
						<div class="field half-right">
							<div class="type-label">{{ t('open_link_in') }}</div>
							<v-checkbox
								v-model="linkSelection.newTab"
								block
								:label="t(linkSelection.newTab ? 'new_tab' : 'current_tab')"
							></v-checkbox>
						</div>
					</div>
				</v-card-text>
				<v-card-actions>
					<v-button secondary @click="closeLinkDrawer">{{ t('cancel') }}</v-button>
					<v-button :disabled="linkSelection.url === null" @click="saveLink">{{ t('save') }}</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-drawer v-model="codeDrawerOpen" :title="t('wysiwyg_options.source_code')" icon="code" @cancel="closeCodeDrawer">
			<div class="content">
				<interface-input-code :value="code" language="htmlmixed" @input="code = $event"></interface-input-code>
			</div>

			<template #actions>
				<v-button icon rounded @click="saveCode">
					<v-icon name="check" />
				</v-button>
			</template>
		</v-drawer>

		<v-drawer v-model="imageDrawerOpen" :title="t('wysiwyg_options.image')" icon="image" @cancel="closeImageDrawer">
			<div class="content">
				<template v-if="imageSelection">
					<img class="image-preview" :src="imageSelection.previewUrl" />
					<div class="grid">
						<div class="field half">
							<div class="type-label">{{ t('image_url') }}</div>
							<v-input v-model="imageSelection.imageUrl" />
						</div>
						<div class="field half-right">
							<div class="type-label">{{ t('alt_text') }}</div>
							<v-input v-model="imageSelection.alt" />
						</div>
						<div class="field half">
							<div class="type-label">{{ t('width') }}</div>
							<v-input v-model="imageSelection.width" />
						</div>
						<div class="field half-right">
							<div class="type-label">{{ t('height') }}</div>
							<v-input v-model="imageSelection.height" />
						</div>
					</div>
				</template>
				<v-upload v-else :multiple="false" from-library from-url @input="onImageSelect" />
			</div>

			<template #actions>
				<v-button v-tooltip.bottom="t('save_image')" icon rounded @click="saveImage">
					<v-icon name="check" />
				</v-button>
			</template>
		</v-drawer>

		<v-drawer v-model="mediaDrawerOpen" :title="t('wysiwyg_options.media')" icon="slideshow" @cancel="closeMediaDrawer">
			<template #sidebar>
				<v-tabs v-model="openMediaTab" vertical>
					<v-tab value="video">{{ t('media') }}</v-tab>
					<v-tab value="embed">{{ t('embed') }}</v-tab>
				</v-tabs>
			</template>

			<div class="content">
				<v-tabs-items v-model="openMediaTab">
					<v-tab-item value="video">
						<template v-if="mediaSelection">
							<video class="media-preview" controls="controls">
								<source :src="mediaSelection.source" />
							</video>
							<div class="grid">
								<div class="field">
									<div class="type-label">{{ t('source') }}</div>
									<v-input v-model="mediaSource" />
								</div>
								<div class="field half">
									<div class="type-label">{{ t('width') }}</div>
									<v-input v-model="mediaWidth" />
								</div>
								<div class="field half-right">
									<div class="type-label">{{ t('height') }}</div>
									<v-input v-model="mediaHeight" />
								</div>
							</div>
						</template>
						<v-upload v-else :multiple="false" from-library from-url @input="onMediaSelect" />
					</v-tab-item>
					<v-tab-item value="embed">
						<div class="grid">
							<div class="field">
								<div class="type-label">{{ t('embed') }}</div>
								<v-textarea v-model="embed" :nullable="false" />
							</div>
						</div>
					</v-tab-item>
				</v-tabs-items>
			</div>

			<template #actions>
				<v-button v-tooltip.bottom="t('save_media')" icon rounded @click="saveMedia">
					<v-icon name="check" />
				</v-button>
			</template>
		</v-drawer>
	</div>
</template>

<script lang="ts">
import { useI18n } from 'vue-i18n';
import { defineComponent, PropType, ref, computed, toRefs, ComponentPublicInstance } from 'vue';

import 'tinymce/tinymce';
import 'tinymce/themes/silver';
import 'tinymce/plugins/media/plugin';
import 'tinymce/plugins/table/plugin';
import 'tinymce/plugins/hr/plugin';
import 'tinymce/plugins/lists/plugin';
import 'tinymce/plugins/image/plugin';
import 'tinymce/plugins/imagetools/plugin';
import 'tinymce/plugins/link/plugin';
import 'tinymce/plugins/pagebreak/plugin';
import 'tinymce/plugins/code/plugin';
import 'tinymce/plugins/insertdatetime/plugin';
import 'tinymce/plugins/autoresize/plugin';
import 'tinymce/plugins/paste/plugin';
import 'tinymce/plugins/preview/plugin';
import 'tinymce/plugins/fullscreen/plugin';
import 'tinymce/plugins/directionality/plugin';
import 'tinymce/icons/default';

import Editor from '@tinymce/tinymce-vue';
import getEditorStyles from './get-editor-styles';
import { escapeRegExp } from 'lodash';
import useImage from './useImage';
import useMedia from './useMedia';
import useLink from './useLink';
import useSourceCode from './useSourceCode';
import { getToken } from '@/api';
import { getPublicURL } from '@/utils/get-root-path';

type CustomFormat = {
	title: string;
	inline: string;
	classes: string;
	styles: Record<string, string>;
	attributes: Record<string, string>;
};

export default defineComponent({
	components: { Editor },
	props: {
		value: {
			type: String,
			default: '',
		},
		toolbar: {
			type: Array as PropType<string[]>,
			default: () => [
				'bold',
				'italic',
				'underline',
				'removeformat',
				'customLink',
				'bullist',
				'numlist',
				'blockquote',
				'h1',
				'h2',
				'h3',
				'customImage',
				'customMedia',
				'hr',
				'code',
				'fullscreen',
			],
		},
		font: {
			type: String as PropType<'sans-serif' | 'serif' | 'monospace'>,
			default: 'sans-serif',
		},
		customFormats: {
			type: Array as PropType<CustomFormat[]>,
			default: () => [],
		},
		tinymceOverrides: {
			type: Object,
			default: null,
		},
		disabled: {
			type: Boolean,
			default: true,
		},
		imageToken: {
			type: String,
			default: undefined,
		},
	},
	emits: ['input'],
	setup(props, { emit }) {
		const { t } = useI18n();

		const editorRef = ref<any | null>(null);
		const editorElement = ref<ComponentPublicInstance | null>(null);
		const { imageToken } = toRefs(props);

		const { imageDrawerOpen, imageSelection, closeImageDrawer, onImageSelect, saveImage, imageButton } = useImage(
			editorRef,
			imageToken
		);

		const {
			mediaDrawerOpen,
			mediaSelection,
			closeMediaDrawer,
			openMediaTab,
			onMediaSelect,
			embed,
			saveMedia,
			mediaHeight,
			mediaWidth,
			mediaSource,
			mediaButton,
		} = useMedia(editorRef, imageToken);

		const { linkButton, linkDrawerOpen, closeLinkDrawer, saveLink, linkSelection } = useLink(editorRef);

		const { codeDrawerOpen, code, closeCodeDrawer, saveCode, sourceCodeButton } = useSourceCode(editorRef);

		const replaceTokens = (value: string, token: string | null) => {
			const url = getPublicURL();
			const regex = new RegExp(
				`(<[^=]+=")(${escapeRegExp(
					url
				)}assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\\?[^#"]*)?(?:#[^"]*)?)("[^>]*>)`,
				'gi'
			);

			return value.replace(regex, (_, pre, matchedUrl, post) => {
				const matched = new URL(matchedUrl);
				const params = new URLSearchParams(matched.search);

				if (!token) {
					params.delete('access_token');
				} else {
					params.set('access_token', token);
				}

				const paramsString = params.toString().length > 0 ? `?${params.toString()}` : '';

				return `${pre}${matched.origin}${matched.pathname}${paramsString}${post}`;
			});
		};

		const internalValue = computed({
			get() {
				if (!props.value) return '';
				return replaceTokens(props.value, getToken());
			},
			set(newValue: string) {
				if (newValue !== props.value && (props.value === null && newValue === '') === false) {
					const removeToken = replaceTokens(newValue, props.imageToken ?? null);
					emit('input', removeToken);
				}
			},
		});

		const editorOptions = computed(() => {
			let styleFormats = null;

			if (Array.isArray(props.customFormats) && props.customFormats.length > 0) {
				styleFormats = props.customFormats;
			}

			let toolbarString = props.toolbar
				.map((t) =>
					t
						.replace(/^link$/g, 'customLink')
						.replace(/^media$/g, 'customMedia')
						.replace(/^code$/g, 'customCode')
						.replace(/^image$/g, 'customImage')
				)
				.join(' ');

			if (styleFormats) {
				toolbarString += ' styleselect';
			}

			return {
				skin: false,
				skin_url: false,
				content_css: false,
				content_style: getEditorStyles(props.font as 'sans-serif' | 'serif' | 'monospace'),
				plugins:
					'media table hr lists image link pagebreak code insertdatetime autoresize paste preview fullscreen directionality',
				branding: false,
				max_height: 1000,
				elementpath: false,
				statusbar: false,
				menubar: false,
				convert_urls: false,
				extended_valid_elements: 'audio[loop],source',
				toolbar: toolbarString,
				style_formats: styleFormats,
				file_picker_types: 'customImage customMedia image media',
				link_default_protocol: 'https',
				setup,
				...(props.tinymceOverrides || {}),
			};
		});

		return {
			t,
			editorElement,
			editorOptions,
			internalValue,
			setFocus,
			onImageSelect,
			saveImage,
			imageDrawerOpen,
			closeImageDrawer,
			imageSelection,
			mediaDrawerOpen,
			mediaSelection,
			closeMediaDrawer,
			openMediaTab,
			embed,
			onMediaSelect,
			saveMedia,
			mediaHeight,
			mediaWidth,
			mediaSource,
			linkButton,
			linkDrawerOpen,
			closeLinkDrawer,
			saveLink,
			linkSelection,
			codeDrawerOpen,
			code,
			closeCodeDrawer,
			saveCode,
			sourceCodeButton,
		};

		function setup(editor: any) {
			editorRef.value = editor;

			editor.ui.registry.addToggleButton('customImage', imageButton);
			editor.ui.registry.addToggleButton('customMedia', mediaButton);
			editor.ui.registry.addToggleButton('customLink', linkButton);
			editor.ui.registry.addButton('customCode', sourceCodeButton);
		}

		function setFocus(val: boolean) {
			if (editorElement.value == null) return;
			const body = editorElement.value.$el.parentElement?.querySelector('.tox-tinymce');

			if (body == null) return;

			if (val) {
				body.classList.add('focus');
			} else {
				body.classList.remove('focus');
			}
		}
	},
});
</script>

<style lang="scss">
@import 'tinymce/skins/ui/oxide/skin.css';
@import './tinymce-overrides.css';
</style>

<style lang="scss" scoped>
@import '@/styles/mixins/form-grid';

.body {
	padding: 20px;
}

.grid {
	@include form-grid;
}

.image-preview,
.media-preview {
	width: 100%;
	height: var(--input-height-tall);
	margin-bottom: 24px;
	object-fit: cover;
	border-radius: var(--border-radius);
}

.content {
	padding: var(--content-padding);
	padding-top: 0;
	padding-bottom: var(--content-padding);
}

:deep(.v-card-title) {
	margin-bottom: 24px;
	font-size: 24px;
}
</style>
