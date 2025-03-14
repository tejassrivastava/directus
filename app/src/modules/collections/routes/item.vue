<template>
	<collections-not-found
		v-if="error || (collectionInfo.meta && collectionInfo.meta.singleton === true && primaryKey !== null)"
	/>

	<private-view v-else :title="title">
		<template v-if="collectionInfo.meta && collectionInfo.meta.singleton === true" #title>
			<h1 class="type-title">
				{{ collectionInfo.name }}
			</h1>
		</template>

		<template v-else-if="isNew === false && collectionInfo.meta && collectionInfo.meta.display_template" #title>
			<v-skeleton-loader v-if="loading || templateDataLoading" class="title-loader" type="text" />

			<h1 v-else class="type-title">
				<render-template
					:collection="collectionInfo.collection"
					:item="templateData"
					:template="collectionInfo.meta.display_template"
				/>
			</h1>
		</template>

		<template #title-outer:prepend>
			<v-button
				v-if="collectionInfo.meta && collectionInfo.meta.singleton === true"
				class="header-icon"
				rounded
				icon
				secondary
				disabled
			>
				<v-icon :name="collectionInfo.icon" />
			</v-button>

			<v-button
				v-else
				v-tooltip.bottom="t('back')"
				class="header-icon"
				rounded
				icon
				secondary
				exact
				@click="router.back()"
			>
				<v-icon name="arrow_back" />
			</v-button>
		</template>

		<template #headline>
			<v-breadcrumb
				v-if="collectionInfo.meta && collectionInfo.meta.singleton === true"
				:items="[{ name: t('collections'), to: '/collections' }]"
			/>
			<v-breadcrumb v-else :items="breadcrumb" />
		</template>

		<template #actions>
			<v-dialog v-if="!isNew" v-model="confirmDelete" :disabled="deleteAllowed === false" @esc="confirmDelete = false">
				<template #activator="{ on }">
					<v-button
						v-if="collectionInfo.meta && collectionInfo.meta.singleton === false"
						v-tooltip.bottom="deleteAllowed ? t('delete_label') : t('not_allowed')"
						rounded
						icon
						class="action-delete"
						:disabled="item === null || deleteAllowed !== true"
						@click="on"
					>
						<v-icon name="delete" outline />
					</v-button>
				</template>

				<v-card>
					<v-card-title>{{ t('delete_are_you_sure') }}</v-card-title>

					<v-card-actions>
						<v-button secondary @click="confirmDelete = false">
							{{ t('cancel') }}
						</v-button>
						<v-button kind="danger" :loading="deleting" @click="deleteAndQuit">
							{{ t('delete_label') }}
						</v-button>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog
				v-if="collectionInfo.meta && collectionInfo.meta.archive_field && !isNew"
				v-model="confirmArchive"
				:disabled="archiveAllowed === false"
				@esc="confirmArchive = false"
			>
				<template #activator="{ on }">
					<v-button
						v-if="collectionInfo.meta && collectionInfo.meta.singleton === false"
						v-tooltip.bottom="archiveTooltip"
						rounded
						icon
						class="action-archive"
						:disabled="item === null || archiveAllowed !== true"
						@click="on"
					>
						<v-icon :name="isArchived ? 'unarchive' : 'archive'" outline />
					</v-button>
				</template>

				<v-card>
					<v-card-title>{{ isArchived ? t('unarchive_confirm') : t('archive_confirm') }}</v-card-title>

					<v-card-actions>
						<v-button secondary @click="confirmArchive = false">
							{{ t('cancel') }}
						</v-button>
						<v-button kind="warning" :loading="archiving" @click="toggleArchive">
							{{ isArchived ? t('unarchive') : t('archive') }}
						</v-button>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-button
				v-tooltip.bottom="saveAllowed ? t('save') : t('not_allowed')"
				rounded
				icon
				:loading="saving"
				:disabled="isSavable === false || saveAllowed === false"
				@click="saveAndQuit"
			>
				<v-icon name="check" />

				<template #append-outer>
					<save-options
						v-if="collectionInfo.meta && collectionInfo.meta.singleton !== true && isSavable === true"
						@save-and-stay="saveAndStay"
						@save-and-add-new="saveAndAddNew"
						@save-as-copy="saveAsCopyAndNavigate"
					/>
				</template>
			</v-button>
		</template>

		<template #navigation>
			<collections-navigation-search />
			<collections-navigation />
		</template>

		<v-form
			ref="form"
			v-model="edits"
			:disabled="isNew ? false : updateAllowed === false"
			:loading="loading"
			:initial-values="item"
			:fields="fields"
			:primary-key="primaryKey || '+'"
			:validation-errors="validationErrors"
		/>

		<v-dialog v-model="confirmLeave" @esc="confirmLeave = false">
			<v-card>
				<v-card-title>{{ t('unsaved_changes') }}</v-card-title>
				<v-card-text>{{ t('unsaved_changes_copy') }}</v-card-text>
				<v-card-actions>
					<v-button secondary @click="discardAndLeave">
						{{ t('discard_changes') }}
					</v-button>
					<v-button @click="confirmLeave = false">{{ t('keep_editing') }}</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<template #sidebar>
			<sidebar-detail icon="info_outline" :title="t('information')" close>
				<div v-md="t('page_help_collections_item')" class="page-description" />
			</sidebar-detail>
			<revisions-drawer-detail
				v-if="isNew === false && internalPrimaryKey && revisionsAllowed && accountabilityScope === 'all'"
				ref="revisionsDrawerDetail"
				:collection="collection"
				:primary-key="internalPrimaryKey"
				:scope="accountabilityScope"
				@revert="revert"
			/>
			<comments-sidebar-detail
				v-if="isNew === false && internalPrimaryKey"
				:collection="collection"
				:primary-key="internalPrimaryKey"
			/>
		</template>
	</private-view>
</template>

<script lang="ts">
import { useI18n } from 'vue-i18n';
import { defineComponent, computed, toRefs, ref, ComponentPublicInstance } from 'vue';

import CollectionsNavigationSearch from '../components/navigation-search.vue';
import CollectionsNavigation from '../components/navigation.vue';
import CollectionsNotFound from './not-found.vue';
import { useCollection } from '@directus/shared/composables';
import RevisionsDrawerDetail from '@/views/private/components/revisions-drawer-detail';
import CommentsSidebarDetail from '@/views/private/components/comments-sidebar-detail';
import useItem from '@/composables/use-item';
import SaveOptions from '@/views/private/components/save-options';
import useShortcut from '@/composables/use-shortcut';
import { useRouter, onBeforeRouteUpdate, onBeforeRouteLeave, NavigationGuard } from 'vue-router';
import { usePermissions } from '@/composables/use-permissions';
import unsavedChanges from '@/composables/unsaved-changes';
import { useTitle } from '@/composables/use-title';
import { renderStringTemplate } from '@/utils/render-string-template';
import useTemplateData from '@/composables/use-template-data';

export default defineComponent({
	name: 'CollectionsItem',
	components: {
		CollectionsNavigation,
		CollectionsNavigationSearch,
		CollectionsNotFound,
		RevisionsDrawerDetail,
		CommentsSidebarDetail,
		SaveOptions,
	},
	props: {
		collection: {
			type: String,
			required: true,
		},
		primaryKey: {
			type: String,
			default: null,
		},
		singleton: {
			type: Boolean,
			default: false,
		},
	},
	setup(props) {
		const { t, te } = useI18n();

		const router = useRouter();

		const form = ref<HTMLElement>();

		const { collection, primaryKey } = toRefs(props);
		const { breadcrumb } = useBreadcrumb();

		const revisionsDrawerDetail = ref<ComponentPublicInstance | null>(null);

		const {
			info: collectionInfo,
			defaults,
			primaryKeyField,
			isSingleton,
			accountabilityScope,
		} = useCollection(collection);

		const {
			isNew,
			edits,
			item,
			saving,
			loading,
			error,
			save,
			remove,
			deleting,
			archive,
			archiving,
			isArchived,
			saveAsCopy,
			refresh,
			validationErrors,
		} = useItem(collection, primaryKey);

		const { templateData, loading: templateDataLoading } = useTemplateData(collectionInfo, primaryKey);

		const hasEdits = computed(() => Object.keys(edits.value).length > 0);

		const isSavable = computed(() => {
			if (saveAllowed.value === false) return false;
			if (hasEdits.value === true) return true;

			if (
				!primaryKeyField.value?.schema?.has_auto_increment &&
				!primaryKeyField.value?.meta?.special?.includes('uuid')
			) {
				return !!edits.value?.[primaryKeyField.value.field];
			}

			if (isNew.value === true) {
				return Object.keys(defaults.value).length > 0 || hasEdits.value;
			}

			return hasEdits.value;
		});

		unsavedChanges(isSavable);

		const confirmDelete = ref(false);
		const confirmArchive = ref(false);

		const confirmLeave = ref(false);
		const leaveTo = ref<string | null>(null);

		const title = computed(() => {
			if (te(`collection_names_singular.${props.collection}`)) {
				return isNew.value
					? t('creating_unit', { unit: t(`collection_names_singular.${props.collection}`) })
					: t('editing_unit', { unit: t(`collection_names_singular.${props.collection}`) });
			}

			return isNew.value
				? t('creating_in', { collection: collectionInfo.value?.name })
				: t('editing_in', { collection: collectionInfo.value?.name });
		});

		const tabTitle = computed(() => {
			let tabTitle = (collectionInfo.value?.name || '') + ' | ';

			if (collectionInfo.value && collectionInfo.value.meta) {
				if (collectionInfo.value.meta.singleton === true) {
					return tabTitle + collectionInfo.value.name;
				} else if (isNew.value === false && collectionInfo.value.meta.display_template) {
					const { displayValue } = renderStringTemplate(collectionInfo.value.meta.display_template, templateData);

					if (displayValue.value !== undefined) return tabTitle + displayValue.value;
				}
			}

			return tabTitle + title.value;
		});

		useTitle(tabTitle);

		const archiveTooltip = computed(() => {
			if (archiveAllowed.value === false) return t('not_allowed');
			if (isArchived.value === true) return t('unarchive');
			return t('archive');
		});

		useShortcut('meta+s', saveAndStay, form);
		useShortcut('meta+shift+s', saveAndAddNew, form);

		const editsGuard: NavigationGuard = (to) => {
			if (hasEdits.value) {
				confirmLeave.value = true;
				leaveTo.value = to.fullPath;
				return false;
			}
		};
		onBeforeRouteUpdate(editsGuard);
		onBeforeRouteLeave(editsGuard);

		const { deleteAllowed, archiveAllowed, saveAllowed, updateAllowed, fields, revisionsAllowed } = usePermissions(
			collection,
			item,
			isNew
		);

		const internalPrimaryKey = computed(() => {
			if (isNew.value) return '+';

			if (isSingleton.value) return item.value?.[primaryKeyField.value?.field];

			return props.primaryKey;
		});

		return {
			t,
			router,
			item,
			loading,
			error,
			isNew,
			edits,
			isSavable,
			hasEdits,
			saving,
			collectionInfo,
			saveAndQuit,
			deleteAndQuit,
			confirmDelete,
			confirmArchive,
			deleting,
			archiving,
			saveAndStay,
			saveAndAddNew,
			saveAsCopyAndNavigate,
			templateData,
			templateDataLoading,
			archiveTooltip,
			breadcrumb,
			title,
			revisionsDrawerDetail,
			refresh,
			confirmLeave,
			leaveTo,
			discardAndLeave,
			deleteAllowed,
			saveAllowed,
			archiveAllowed,
			isArchived,
			updateAllowed,
			toggleArchive,
			validationErrors,
			form,
			fields,
			isSingleton,
			internalPrimaryKey,
			revisionsAllowed,
			revert,
			accountabilityScope,
		};

		function useBreadcrumb() {
			const breadcrumb = computed(() => [
				{
					name: collectionInfo.value?.name,
					to: `/collections/${props.collection}`,
				},
			]);

			return { breadcrumb };
		}

		async function saveAndQuit() {
			if (isSavable.value === false) return;

			try {
				await save();
				if (props.singleton === false) router.push(`/collections/${props.collection}`);
			} catch {
				// Save shows unexpected error dialog
			}
		}

		async function saveAndStay() {
			if (isSavable.value === false) return;

			try {
				const savedItem: Record<string, any> = await save();

				revisionsDrawerDetail.value?.refresh?.();

				if (props.primaryKey === '+') {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const newPrimaryKey = savedItem[primaryKeyField.value!.field];
					router.replace(`/collections/${props.collection}/${encodeURIComponent(newPrimaryKey)}`);
				}
			} catch {
				// Save shows unexpected error dialog
			}
		}

		async function saveAndAddNew() {
			if (isSavable.value === false) return;

			try {
				await save();

				if (isNew.value === true) {
					refresh();
				} else {
					router.push(`/collections/${props.collection}/+`);
				}
			} catch {
				// Save shows unexpected error dialog
			}
		}

		async function saveAsCopyAndNavigate() {
			try {
				const newPrimaryKey = await saveAsCopy();
				if (newPrimaryKey) router.push(`/collections/${props.collection}/${encodeURIComponent(newPrimaryKey)}`);
			} catch {
				// Save shows unexpected error dialog
			}
		}

		async function deleteAndQuit() {
			try {
				await remove();
				edits.value = {};
				router.push(`/collections/${props.collection}`);
			} catch {
				// `remove` will show the unexpected error dialog
			}
		}

		async function toggleArchive() {
			try {
				await archive();

				if (isArchived.value === true) {
					router.push(`/collections/${props.collection}`);
				} else {
					confirmArchive.value = false;
				}
			} catch {
				// `archive` will show the unexpected error dialog
			}
		}

		function discardAndLeave() {
			if (!leaveTo.value) return;
			edits.value = {};
			confirmLeave.value = false;
			router.push(leaveTo.value);
		}

		function revert(values: Record<string, any>) {
			edits.value = {
				...edits.value,
				...values,
			};
		}
	},
});
</script>

<style lang="scss" scoped>
.action-delete {
	--v-button-background-color: var(--danger-10);
	--v-button-color: var(--danger);
	--v-button-background-color-hover: var(--danger-25);
	--v-button-color-hover: var(--danger);
}

.action-archive {
	--v-button-background-color: var(--warning-10);
	--v-button-color: var(--warning);
	--v-button-background-color-hover: var(--warning-25);
	--v-button-color-hover: var(--warning);
}

.header-icon.secondary {
	--v-button-background-color: var(--background-normal);
	--v-button-color-disabled: var(--foreground-normal);
	--v-button-color-active: var(--foreground-normal);
}

.v-form {
	padding: calc(var(--content-padding) * 3) var(--content-padding) var(--content-padding);
	padding-bottom: var(--content-padding-bottom);

	@media (min-width: 600px) {
		padding: var(--content-padding);
		padding-bottom: var(--content-padding-bottom);
	}
}

.title-loader {
	width: 260px;
}
</style>
