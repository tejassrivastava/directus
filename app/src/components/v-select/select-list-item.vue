<template>
	<v-divider v-if="item.divider === true" />

	<v-list-item
		v-else
		:active="multiple ? (modelValue || []).includes(item.value) : modelValue === item.value"
		:disabled="item.disabled"
		clickable
		@click="multiple ? null : $emit('update:modelValue', item.value)"
	>
		<v-list-item-icon v-if="multiple === false && allowOther === false && item.icon">
			<v-icon :name="item.icon" />
		</v-list-item-icon>
		<v-list-item-content>
			<span v-if="multiple === false || item.selectable === false" class="item-text">{{ item.text }}</span>
			<v-checkbox
				v-else
				:model-value="modelValue || []"
				:label="item.text"
				:value="item.value"
				:disabled="item.disabled"
				@update:model-value="$emit('update:modelValue', $event.length > 0 ? $event : null)"
			/>
		</v-list-item-content>
	</v-list-item>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Option } from './types';

export default defineComponent({
	name: 'SelectListItem',
	props: {
		item: {
			type: Object as PropType<Option>,
			required: true,
		},
		modelValue: {
			type: [String, Number, Array] as PropType<string | number | (string | number)[]>,
			default: null,
		},
		multiple: {
			type: Boolean,
			required: true,
		},
		allowOther: {
			type: Boolean,
			required: true,
		},
	},
	emits: ['update:modelValue'],
});
</script>
