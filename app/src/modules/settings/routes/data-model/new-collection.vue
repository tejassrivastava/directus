<template>
	<v-drawer
		:title="t('creating_new_collection')"
		:model-value="isOpen"
		class="new-collection"
		persistent
		:sidebar-label="t(currentTab[0])"
		@cancel="router.push('/settings/data-model')"
	>
		<template #sidebar>
			<v-tabs v-model="currentTab" vertical>
				<v-tab value="collection_setup">{{ t('collection_setup') }}</v-tab>
				<v-tab value="optional_system_fields" :disabled="!collectionName">
					{{ t('optional_system_fields') }}
				</v-tab>
			</v-tabs>
		</template>

		<v-tabs-items v-model="currentTab" class="content">
			<v-tab-item value="collection_setup">
				<v-notice type="info">{{ t('creating_collection_info') }}</v-notice>

				<div class="grid">
					<div class="field half">
						<div class="type-label">
							{{ t('name') }}
							<v-icon v-tooltip="t('required')" class="required" name="star" sup />
						</div>
						<v-input
							v-model="collectionName"
							autofocus
							class="monospace"
							db-safe
							:placeholder="t('a_unique_table_name')"
						/>
					</div>
					<div class="field half">
						<div class="type-label">{{ t('singleton') }}</div>
						<v-checkbox v-model="singleton" block :label="t('singleton_label')" />
					</div>
					<v-divider class="full" />
					<div class="field half">
						<div class="type-label">{{ t('primary_key_field') }}</div>
						<v-input v-model="primaryKeyFieldName" class="monospace" db-safe :placeholder="t('a_unique_column_name')" />
					</div>
					<div class="field half">
						<div class="type-label">{{ t('type') }}</div>
						<v-select
							v-model="primaryKeyFieldType"
							:items="[
								{
									text: t('auto_increment_integer'),
									value: 'auto_int',
								},
								{
									text: t('generated_uuid'),
									value: 'uuid',
								},
								{
									text: t('manual_string'),
									value: 'manual',
								},
							]"
						/>
					</div>
				</div>
			</v-tab-item>
			<v-tab-item value="optional_system_fields">
				<v-notice type="info">{{ t('creating_collection_system') }}</v-notice>

				<div class="grid system">
					<div
						v-for="(info, field, index) in systemFields"
						:key="field"
						class="field"
						:class="index % 2 === 0 ? 'half' : 'half-right'"
					>
						<div class="type-label">{{ t(info.label) }}</div>
						<v-input
							v-model="info.name"
							class="monospace"
							:class="{ active: info.enabled }"
							@focus="info.enabled = true"
						>
							<template #prepend>
								<v-checkbox v-model="info.enabled" />
							</template>

							<template #append>
								<v-icon :name="info.icon" />
							</template>
						</v-input>
					</div>
				</div>
			</v-tab-item>
		</v-tabs-items>

		<template #actions>
			<v-button
				v-if="currentTab[0] === 'collection_setup'"
				v-tooltip.bottom="t('next')"
				:disabled="!collectionName || collectionName.length === 0"
				icon
				rounded
				@click="currentTab = ['optional_system_fields']"
			>
				<v-icon name="arrow_forward" />
			</v-button>
			<v-button
				v-if="currentTab[0] === 'optional_system_fields'"
				v-tooltip.bottom="t('finish_setup')"
				:loading="saving"
				icon
				rounded
				@click="save"
			>
				<v-icon name="check" />
			</v-button>
		</template>
	</v-drawer>
</template>

<script lang="ts">
import { useI18n } from 'vue-i18n';
import { defineComponent, ref, reactive } from 'vue';
import api from '@/api';
import { Field, Relation } from '@directus/shared/types';
import { useFieldsStore, useCollectionsStore, useRelationsStore } from '@/stores/';
import { notify } from '@/utils/notify';
import { useDialogRoute } from '@/composables/use-dialog-route';
import { useRouter } from 'vue-router';
import { unexpectedError } from '@/utils/unexpected-error';
import { DeepPartial } from '@directus/shared/types';

export default defineComponent({
	setup() {
		const { t } = useI18n();

		const router = useRouter();

		const collectionsStore = useCollectionsStore();
		const fieldsStore = useFieldsStore();
		const relationsStore = useRelationsStore();

		const isOpen = useDialogRoute();

		const currentTab = ref(['collection_setup']);

		const collectionName = ref(null);
		const singleton = ref(false);
		const primaryKeyFieldName = ref('id');
		const primaryKeyFieldType = ref<'auto_int' | 'uuid' | 'manual'>('auto_int');

		const sortField = ref<string>();

		const archiveField = ref<string>();
		const archiveValue = ref<string>();
		const unarchiveValue = ref<string>();

		const systemFields = reactive({
			status: {
				enabled: false,
				name: 'status',
				label: 'status',
				icon: 'flag',
			},
			sort: {
				enabled: false,
				name: 'sort',
				label: 'sort',
				icon: 'low_priority',
			},
			dateCreated: {
				enabled: false,
				name: 'date_created',
				label: 'created_on',
				icon: 'access_time',
			},
			userCreated: {
				enabled: false,
				name: 'user_created',
				label: 'created_by',
				icon: 'account_circle',
			},
			dateUpdated: {
				enabled: false,
				name: 'date_updated',
				label: 'updated_on',
				icon: 'access_time',
			},
			userUpdated: {
				enabled: false,
				name: 'user_updated',
				label: 'updated_by',
				icon: 'account_circle',
			},
		});

		const saving = ref(false);

		return {
			t,
			router,
			isOpen,
			currentTab,
			save,
			systemFields,
			primaryKeyFieldName,
			primaryKeyFieldType,
			collectionName,
			saving,
			singleton,
		};

		async function save() {
			saving.value = true;

			try {
				await api.post(`/collections`, {
					collection: collectionName.value,
					fields: [getPrimaryKeyField(), ...getSystemFields()],
					meta: {
						sort_field: sortField.value,
						archive_field: archiveField.value,
						archive_value: archiveValue.value,
						unarchive_value: unarchiveValue.value,
						singleton: singleton.value,
					},
				});

				const relations = getSystemRelations();

				if (relations.length > 0) {
					for (const relation of relations) {
						await api.post('/relations', relation);
					}

					await relationsStore.hydrate();
				}

				await collectionsStore.hydrate();
				await fieldsStore.hydrate();

				notify({
					title: t('collection_created'),
					type: 'success',
				});

				router.push(`/settings/data-model/${collectionName.value}`);
			} catch (err: any) {
				unexpectedError(err);
			} finally {
				saving.value = false;
			}
		}

		function getPrimaryKeyField() {
			if (primaryKeyFieldType.value === 'uuid') {
				return {
					field: primaryKeyFieldName.value,
					type: 'uuid',
					meta: {
						hidden: true,
						readonly: true,
						interface: 'input',
						special: ['uuid'],
					},
					schema: {
						is_primary_key: true,
						length: 36,
						has_auto_increment: false,
					},
				};
			} else if (primaryKeyFieldType.value === 'manual') {
				return {
					field: primaryKeyFieldName.value,
					type: 'string',
					meta: {
						interface: 'input',
						readonly: false,
						hidden: false,
					},
					schema: {
						is_primary_key: true,
						length: 255,
						has_auto_increment: false,
					},
				};
			} else {
				return {
					field: primaryKeyFieldName.value,
					type: 'integer',
					meta: {
						hidden: true,
						interface: 'input',
						readonly: true,
					},
					schema: {
						is_primary_key: true,
						has_auto_increment: true,
					},
				};
			}
		}

		function getSystemFields() {
			const fields: DeepPartial<Field>[] = [];

			// Status
			if (systemFields.status.enabled === true) {
				fields.push({
					field: systemFields.status.name,
					type: 'string',
					meta: {
						width: 'full',
						options: {
							choices: [
								{
									text: '$t:published',
									value: 'published',
								},
								{
									text: '$t:draft',
									value: 'draft',
								},
								{
									text: '$t:archived',
									value: 'archived',
								},
							],
						},
						interface: 'select-dropdown',
						display: 'labels',
						display_options: {
							showAsDot: true,
							choices: [
								{
									background: '#00C897',
									value: 'published',
								},
								{
									background: '#D3DAE4',
									value: 'draft',
								},
								{
									background: '#F7971C',
									value: 'archived',
								},
							],
						},
					},
					schema: {
						default_value: 'draft',
						is_nullable: false,
					},
				});

				archiveField.value = 'status';
				archiveValue.value = 'archived';
				unarchiveValue.value = 'draft';
			}

			// Sort
			if (systemFields.sort.enabled === true) {
				fields.push({
					field: systemFields.sort.name,
					type: 'integer',
					meta: {
						interface: 'input',
						hidden: true,
					},
					schema: {},
				});

				sortField.value = systemFields.sort.name;
			}

			if (systemFields.userCreated.enabled === true) {
				fields.push({
					field: systemFields.userCreated.name,
					type: 'uuid',
					meta: {
						special: ['user-created'],
						interface: 'select-dropdown-m2o',
						options: {
							template: '{{avatar.$thumbnail}} {{first_name}} {{last_name}}',
						},
						display: 'user',
						readonly: true,
						hidden: true,
						width: 'half',
					},
					schema: {},
				});
			}

			if (systemFields.dateCreated.enabled === true) {
				fields.push({
					field: systemFields.dateCreated.name,
					type: 'timestamp',
					meta: {
						special: ['date-created'],
						interface: 'datetime',
						readonly: true,
						hidden: true,
						width: 'half',
						display: 'datetime',
						display_options: {
							relative: true,
						},
					},
					schema: {},
				});
			}

			if (systemFields.userUpdated.enabled === true) {
				fields.push({
					field: systemFields.userUpdated.name,
					type: 'uuid',
					meta: {
						special: ['user-updated'],
						interface: 'select-dropdown-m2o',
						options: {
							template: '{{avatar.$thumbnail}} {{first_name}} {{last_name}}',
						},
						display: 'user',
						readonly: true,
						hidden: true,
						width: 'half',
					},
					schema: {},
				});
			}

			if (systemFields.dateUpdated.enabled === true) {
				fields.push({
					field: systemFields.dateUpdated.name,
					type: 'timestamp',
					meta: {
						special: ['date-updated'],
						interface: 'datetime',
						readonly: true,
						hidden: true,
						width: 'half',
						display: 'datetime',
						display_options: {
							relative: true,
						},
					},
					schema: {},
				});
			}

			return fields;
		}

		function getSystemRelations() {
			const relations: Partial<Relation>[] = [];

			if (systemFields.userCreated.enabled === true) {
				relations.push({
					collection: collectionName.value!,
					field: systemFields.userCreated.name,
					related_collection: 'directus_users',
				});
			}

			if (systemFields.userUpdated.enabled === true) {
				relations.push({
					collection: collectionName.value!,
					field: systemFields.userUpdated.name,
					related_collection: 'directus_users',
				});
			}

			return relations;
		}
	},
});
</script>

<style lang="scss" scoped>
@import '@/styles/mixins/form-grid';

.type-title {
	margin-bottom: 48px;
}

.grid {
	@include form-grid;
}

.system :deep(.v-input .input) {
	color: var(--foreground-subdued);
}

.system :deep(.v-input .active .input) {
	color: var(--foreground-normal);
}

.system .v-icon {
	--v-icon-color: var(--foreground-subdued);
}

.spacer {
	flex-grow: 1;
}

.v-input.monospace {
	--v-input-font-family: var(--family-monospace);
}

.required {
	color: var(--primary);
}

.content {
	padding: var(--content-padding);
	padding-top: 0;
	padding-bottom: var(--content-padding);
}

.v-notice {
	margin-bottom: 36px;
}
</style>
