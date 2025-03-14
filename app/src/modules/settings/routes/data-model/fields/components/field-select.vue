<template>
	<div class="field-select" :class="field.meta?.width || 'full'">
		<v-input v-if="disabled" disabled class="field">
			<template #prepend>
				<v-icon v-tooltip="t('system_fields_locked')" name="lock" />
			</template>

			<template #input>
				<div class="label">
					<span class="name">{{ field.field }}</span>
				</div>
			</template>
		</v-input>

		<template v-else>
			<draggable
				v-if="localType === 'group'"
				class="field-grid group full nested"
				:model-value="nestedFields"
				:force-fallback="true"
				handle=".drag-handle"
				:group="{ name: 'fields' }"
				:set-data="hideDragImage"
				:animation="150"
				item-key="field"
				:fallback-on-body="true"
				:invert-swap="true"
				@update:model-value="onGroupSortChange"
			>
				<template #header>
					<div class="header full">
						<v-icon class="drag-handle" name="drag_indicator" @click.stop />
						<span class="name">{{ field.field }}</span>
						<v-icon v-if="hidden" v-tooltip="t('hidden_field')" name="visibility_off" class="hidden-icon" small />
						<field-select-menu
							:field="field"
							:no-delete="nestedFields.length > 0"
							@toggleVisibility="toggleVisibility"
							@setWidth="setWidth($event)"
							@duplicate="duplicateActive = true"
							@delete="deleteActive = true"
						/>
					</div>
				</template>

				<template #item="{ element }">
					<field-select :field="element" :fields="fields" @setNestedSort="$emit('setNestedSort', $event)" />
				</template>
			</draggable>

			<v-input v-else class="field" :class="{ hidden }" readonly>
				<template #prepend>
					<v-icon class="drag-handle" name="drag_indicator" @click.stop />
				</template>

				<template #input>
					<div
						v-tooltip="interfaceName ? `${field.name} (${interfaceName})` : field.name"
						class="label"
						@click="openFieldDetail"
					>
						<div class="label-inner">
							<span class="name">
								{{ field.field }}
								<v-icon v-if="field.meta?.required === true" name="star" class="required" sup />
							</span>
							<span v-if="field.meta" class="interface">{{ interfaceName }}</span>
							<span v-else class="interface">{{ t('db_only_click_to_configure') }}</span>
						</div>
					</div>
				</template>

				<template #append>
					<div class="icons">
						<v-icon
							v-if="field.schema && field.schema.is_primary_key"
							v-tooltip="t('primary_key')"
							name="vpn_key"
							small
						/>
						<v-icon
							v-if="!field.meta"
							v-tooltip="t('db_only_click_to_configure')"
							name="report_problem"
							class="unmanaged"
							small
						/>
						<v-icon v-if="hidden" v-tooltip="t('hidden_field')" name="visibility_off" class="hidden-icon" small />
						<field-select-menu
							:field="field"
							@toggleVisibility="toggleVisibility"
							@setWidth="setWidth($event)"
							@duplicate="duplicateActive = true"
							@delete="deleteActive = true"
						/>
					</div>
				</template>
			</v-input>

			<v-dialog v-model="duplicateActive" @esc="duplicateActive = false">
				<v-card class="duplicate">
					<v-card-title>{{ t('duplicate_where_to') }}</v-card-title>
					<v-card-text>
						<div class="form-grid">
							<div class="field">
								<span class="type-label">{{ t('collection', 0) }}</span>
								<v-select v-model="duplicateTo" class="monospace" :items="collections" />
							</div>

							<div class="field">
								<span class="type-label">{{ t('field', 0) }}</span>
								<v-input v-model="duplicateName" class="monospace" db-safe autofocus />
							</div>
						</div>
					</v-card-text>
					<v-card-actions>
						<v-button secondary @click="duplicateActive = false">
							{{ t('cancel') }}
						</v-button>
						<v-button :disabled="duplicateName === null" :loading="duplicating" @click="saveDuplicate">
							{{ t('duplicate') }}
						</v-button>
					</v-card-actions>
				</v-card>
			</v-dialog>

			<v-dialog v-model="deleteActive" @esc="deleteActive = false">
				<v-card>
					<v-card-title>{{ t('delete_field_are_you_sure', { field: field.field }) }}</v-card-title>
					<v-card-actions>
						<v-button secondary @click="deleteActive = false">{{ t('cancel') }}</v-button>
						<v-button :loading="deleting" kind="danger" @click="deleteField">{{ t('delete_label') }}</v-button>
					</v-card-actions>
				</v-card>
			</v-dialog>
		</template>
	</div>
</template>

<script lang="ts">
import { useI18n } from 'vue-i18n';
import { defineComponent, PropType, ref, computed } from 'vue';
import { useCollectionsStore, useFieldsStore } from '@/stores/';
import { getInterfaces } from '@/interfaces';
import { useRouter } from 'vue-router';
import { cloneDeep } from 'lodash';
import { getLocalTypeForField } from '../../get-local-type';
import { notify } from '@/utils/notify';
import { unexpectedError } from '@/utils/unexpected-error';
import { Field, InterfaceConfig } from '@directus/shared/types';
import FieldSelectMenu from './field-select-menu.vue';
import hideDragImage from '@/utils/hide-drag-image';
import Draggable from 'vuedraggable';

export default defineComponent({
	name: 'FieldSelect',
	components: { FieldSelectMenu, Draggable },
	props: {
		field: {
			type: Object as PropType<Field>,
			required: true,
		},
		disabled: {
			type: Boolean,
			default: false,
		},
		fields: {
			type: Array as PropType<Field[]>,
			default: () => [],
		},
	},
	emits: ['setNestedSort'],
	setup(props, { emit }) {
		const { t } = useI18n();

		const router = useRouter();

		const collectionsStore = useCollectionsStore();
		const fieldsStore = useFieldsStore();
		const { interfaces } = getInterfaces();

		const editActive = ref(false);

		const { deleteActive, deleting, deleteField } = useDeleteField();
		const { duplicateActive, duplicateName, collections, duplicateTo, saveDuplicate, duplicating } = useDuplicate();

		const interfaceName = computed(() => {
			return interfaces.value.find((inter: InterfaceConfig) => inter.id === props.field.meta?.interface)?.name;
		});

		const hidden = computed(() => props.field.meta?.hidden === true);

		const localType = computed(() => getLocalTypeForField(props.field.collection, props.field.field));

		const nestedFields = computed(() => props.fields.filter((field) => field.meta?.group === props.field.meta?.id));

		return {
			t,
			interfaceName,
			editActive,
			setWidth,
			deleteActive,
			deleting,
			deleteField,
			duplicateActive,
			collections,
			duplicateName,
			duplicateTo,
			saveDuplicate,
			duplicating,
			openFieldDetail,
			hidden,
			toggleVisibility,
			localType,
			hideDragImage,
			onGroupSortChange,
			nestedFields,
		};

		function setWidth(width: string) {
			fieldsStore.updateField(props.field.collection, props.field.field, { meta: { width } });
		}

		function toggleVisibility() {
			fieldsStore.updateField(props.field.collection, props.field.field, {
				meta: { hidden: !props.field.meta?.hidden },
			});
		}

		function useDeleteField() {
			const deleteActive = ref(false);
			const deleting = ref(false);

			return {
				deleteActive,
				deleting,
				deleteField,
			};

			async function deleteField() {
				await fieldsStore.deleteField(props.field.collection, props.field.field);
				deleting.value = false;
				deleteActive.value = false;
			}
		}

		function useDuplicate() {
			const duplicateActive = ref(false);
			const duplicateName = ref(props.field.field + '_copy');
			const duplicating = ref(false);
			const collections = computed(() =>
				collectionsStore.collections
					.map(({ collection }) => collection)
					.filter((collection) => collection.startsWith('directus_') === false)
			);
			const duplicateTo = ref(props.field.collection);

			return {
				duplicateActive,
				duplicateName,
				collections,
				duplicateTo,
				saveDuplicate,
				duplicating,
			};

			async function saveDuplicate() {
				const newField: Record<string, any> = {
					...cloneDeep(props.field),
					field: duplicateName.value,
					collection: duplicateTo.value,
				};

				if (newField.meta) {
					delete newField.meta.id;
					delete newField.meta.sort;
					delete newField.meta.group;
				}

				if (newField.schema) {
					delete newField.schema.comment;
				}

				delete newField.name;

				duplicating.value = true;

				try {
					await fieldsStore.createField(duplicateTo.value, newField);

					notify({
						title: t('field_create_success', { field: newField.field }),
						type: 'success',
					});

					duplicateActive.value = false;
				} catch (err: any) {
					unexpectedError(err);
				} finally {
					duplicating.value = false;
				}
			}
		}

		async function openFieldDetail() {
			if (!props.field.meta) {
				await fieldsStore.updateField(props.field.collection, props.field.field, { meta: {} });
			}

			router.push(`/settings/data-model/${props.field.collection}/${props.field.field}`);
		}

		async function onGroupSortChange(fields: Field[]) {
			const updates = fields.map((field, index) => ({
				field: field.field,
				meta: {
					sort: index + 1,
					group: props.field.meta!.id,
				},
			}));

			emit('setNestedSort', updates);
		}
	},
});
</script>

<style lang="scss" scoped>
@import '@/styles/mixins/form-grid';

.field-select {
	--input-height: 48px;
	--input-padding: 8px;
}

.full,
.fill {
	grid-column: 1 / span 2;
}

.v-input.hidden {
	--background-page: var(--background-subdued);
}

.v-input.monospace {
	--v-input-font-family: var(--family-monospace);
}

.v-select.monospace {
	--v-select-font-family: var(--family-monospace);
}

.v-icon {
	--v-icon-color: var(--foreground-subdued);
	--v-icon-color-hover: var(--foreground);

	&.hidden-icon {
		--v-icon-color-hover: var(--foreground-subdued);
	}

	&.unmanaged {
		--v-icon-color: var(--warning);
		--v-icon-color-hover: var(--warning);
	}
}

.drag-handle {
	cursor: grab !important;
}

.duplicate {
	.type-label {
		margin-bottom: 4px;
	}

	.duplicate-field + .duplicate-field {
		margin-bottom: 32px;
	}
}

.group {
	position: relative;
	min-height: var(--input-height);
	padding: var(--input-padding);
	padding-top: 40px;
	padding-bottom: 16px;
	border-radius: var(--border-radius);

	> * {
		position: relative;
		z-index: 2;
	}

	&::before {
		position: absolute;
		top: 0;
		left: -2px;
		z-index: 1;
		width: 4px;
		height: 100%;
		background-color: var(--primary);
		border-radius: 2px;
		content: '';
	}

	&::after {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		background-color: var(--primary);
		opacity: 0.1;
		content: '';
	}

	.header {
		position: absolute;
		top: 0;
		left: 0;
		display: flex;
		align-items: center;
		width: 100%;
		margin-bottom: 8px;
		padding-top: 8px;
		color: var(--primary);
		font-family: var(--family-monospace);

		.drag-handle {
			--v-icon-color: var(--primary);

			margin-right: 8px;
		}

		.name {
			flex-grow: 1;
		}
	}
}

.field-grid {
	position: relative;
	display: grid;
	grid-gap: 12px;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);

	& + & {
		margin-top: 12px;
	}
}

.field {
	:deep(.input) {
		background-color: var(--card-face-color) !important;
		border: none !important;
		box-shadow: 0px 0px 6px 0px rgba(var(--card-shadow-color), 0.2) !important;
	}

	:deep(.input:hover) {
		background-color: var(--card-face-color) !important;
	}

	.label {
		display: flex;
		flex-grow: 1;
		align-items: center;
		align-self: stretch;
		overflow: hidden;
		cursor: pointer;

		.label-inner {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;

			.name {
				margin-right: 12px;
				font-family: var(--family-monospace);
			}

			.interface {
				display: none;
				color: var(--foreground-subdued);
				font-family: var(--family-monospace);
				opacity: 0;
				transition: opacity var(--fast) var(--transition);

				@media (min-width: 600px) {
					display: initial;
				}
			}
		}
	}

	&:hover {
		.label {
			.interface {
				opacity: 1;
			}
		}
	}
}

.v-list-item.danger {
	--v-list-item-color: var(--danger);
	--v-list-item-color-hover: var(--danger);
	--v-list-item-icon-color: var(--danger);
}

.icons {
	.v-icon + .v-icon:not(:last-child) {
		margin-left: 8px;
	}
}

.spacer {
	flex-grow: 1;
}

.form-grid {
	--form-vertical-gap: 24px;
}

.required {
	position: relative;
	left: -8px;
	color: var(--primary);
}

.sortable-ghost {
	border-radius: var(--border-radius);
	outline: 2px dashed var(--primary);

	> * {
		opacity: 0;
	}
}
</style>
