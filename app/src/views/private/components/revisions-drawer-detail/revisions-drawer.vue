<template>
	<div>
		<v-drawer
			v-model="internalActive"
			:title="t('item_revision')"
			icon="change_history"
			:sidebar-label="t(currentTab[0])"
			@cancel="internalActive = false"
		>
			<template #subtitle>
				<revisions-drawer-picker v-model:current="internalCurrent" :revisions="revisions" />
			</template>

			<template #sidebar>
				<v-tabs v-model="currentTab" vertical>
					<v-tab v-for="tab in tabs" :key="tab.value" :value="tab.value">
						{{ tab.text }}
					</v-tab>
				</v-tabs>
			</template>

			<div class="content">
				<revisions-drawer-updates
					v-if="currentTab[0] === 'updates_made'"
					:revision="currentRevision"
					:revisions="revisions"
				/>
				<revisions-drawer-preview v-if="currentTab[0] === 'revision_preview'" :revision="currentRevision" />
			</div>

			<template #actions>
				<v-button v-tooltip.bottom="t('revert')" class="revert" icon rounded @click="revert">
					<v-icon name="restore" />
				</v-button>
				<v-button v-tooltip.bottom="t('done')" icon rounded @click="internalActive = false">
					<v-icon name="check" />
				</v-button>
			</template>
		</v-drawer>
	</div>
</template>

<script lang="ts">
import { useI18n } from 'vue-i18n';
import { defineComponent, PropType, computed, ref } from 'vue';
import { useSync } from '@directus/shared/composables';
import { Revision } from './types';
import RevisionsDrawerPicker from './revisions-drawer-picker.vue';
import RevisionsDrawerPreview from './revisions-drawer-preview.vue';
import RevisionsDrawerUpdates from './revisions-drawer-updates.vue';
import { isEqual } from 'lodash';

export default defineComponent({
	components: { RevisionsDrawerPicker, RevisionsDrawerPreview, RevisionsDrawerUpdates },
	props: {
		revisions: {
			type: Array as PropType<Revision[]>,
			required: true,
		},
		current: {
			type: [Number, String],
			default: null,
		},
		active: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['revert', 'update:active', 'update:current'],
	setup(props, { emit }) {
		const { t } = useI18n();

		const internalActive = useSync(props, 'active', emit);
		const internalCurrent = useSync(props, 'current', emit);

		const currentTab = ref(['updates_made']);

		const currentRevision = computed(() => {
			return props.revisions.find((revision) => revision.id === props.current);
		});

		const previousRevision = computed<Revision | undefined>(() => {
			const currentIndex = props.revisions.findIndex((revision) => revision.id === props.current);

			// This is assuming props.revisions is in chronological order from newest to oldest
			return props.revisions[currentIndex + 1];
		});

		const tabs = [
			{
				text: t('updates_made'),
				value: 'updates_made',
			},
			{
				text: t('revision_preview'),
				value: 'revision_preview',
			},
		];

		return { t, internalActive, internalCurrent, currentRevision, currentTab, tabs, revert };

		function revert() {
			if (!currentRevision.value) return;

			const revertToValues: Record<string, any> = {};

			for (const [field, newValue] of Object.entries(currentRevision.value.delta)) {
				const previousValue = previousRevision.value?.data[field] ?? null;
				if (isEqual(newValue, previousValue)) continue;
				revertToValues[field] = previousValue;
			}

			emit('revert', revertToValues);

			internalActive.value = false;
		}
	},
});
</script>

<style lang="scss" scoped>
.revert {
	--v-button-background-color: var(--warning);
	--v-button-background-color-hover: var(--warning-125);
}

.content {
	padding: var(--content-padding);
	padding-top: 0;
	padding-bottom: var(--content-padding);
}
</style>
