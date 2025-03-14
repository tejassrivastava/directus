import Joi from 'joi';
import { isPlainObject } from 'lodash';
import { InvalidQueryException } from '../exceptions';
import { Query } from '../types';
import { stringify } from 'wellknown';

const querySchema = Joi.object({
	fields: Joi.array().items(Joi.string()),
	group: Joi.array().items(Joi.string()),
	sort: Joi.array().items(
		Joi.object({
			column: Joi.string(),
			order: Joi.string().valid('asc', 'desc'),
		})
	),
	filter: Joi.object({}).unknown(),
	limit: Joi.number(),
	offset: Joi.number(),
	page: Joi.number(),
	meta: Joi.array().items(Joi.string().valid('total_count', 'filter_count')),
	search: Joi.string(),
	export: Joi.string().valid('json', 'csv', 'xml'),
	aggregate: Joi.object(),
	deep: Joi.object(),
	alias: Joi.object(),
}).id('query');

export function validateQuery(query: Query): Query {
	const { error } = querySchema.validate(query);

	if (query.filter && Object.keys(query.filter).length > 0) {
		validateFilter(query.filter);
	}

	if (query.alias) {
		validateAlias(query.alias);
	}

	if (error) {
		throw new InvalidQueryException(error.message);
	}

	return query;
}

function validateFilter(filter: Query['filter']) {
	if (!filter) throw new InvalidQueryException('Invalid filter object');

	for (const [key, nested] of Object.entries(filter)) {
		if (key === '_and' || key === '_or') {
			nested.forEach(validateFilter);
		} else if (key.startsWith('_')) {
			const value = nested;

			switch (key) {
				case '_eq':
				case '_neq':
				case '_contains':
				case '_ncontains':
				case '_starts_with':
				case '_nstarts_with':
				case '_ends_with':
				case '_nends_with':
				case '_gt':
				case '_gte':
				case '_lt':
				case '_lte':
				default:
					validateFilterPrimitive(value, key);
					break;
				case '_in':
				case '_nin':
				case '_between':
				case '_nbetween':
					validateList(value, key);
					break;
				case '_null':
				case '_nnull':
				case '_empty':
				case '_nempty':
					validateBoolean(value, key);
					break;

				case '_intersects':
				case '_nintersects':
				case '_intersects_bbox':
				case '_nintersects_bbox':
					validateGeometry(value, key);
					break;
			}
		} else if (isPlainObject(nested)) {
			validateFilter(nested);
		} else if (Array.isArray(nested) === false) {
			validateFilterPrimitive(nested, '_eq');
		} else {
			validateFilter(nested);
		}
	}
}

function validateFilterPrimitive(value: any, key: string) {
	if (value === null) return true;

	if (
		(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) ===
		false
	) {
		throw new InvalidQueryException(`The filter value for "${key}" has to be a string, number, or boolean`);
	}

	if (typeof value === 'number' && Number.isNaN(value)) {
		throw new InvalidQueryException(`The filter value for "${key}" is not a valid number`);
	}

	if (typeof value === 'string' && value.length === 0) {
		throw new InvalidQueryException(
			`You can't filter for an empty string in "${key}". Use "_empty" or "_nempty" instead`
		);
	}

	return true;
}

function validateList(value: any, key: string) {
	if (Array.isArray(value) === false || value.length === 0) {
		throw new InvalidQueryException(`"${key}" has to be an array of values`);
	}

	return true;
}

function validateBoolean(value: any, key: string) {
	if (typeof value !== 'boolean') {
		throw new InvalidQueryException(`"${key}" has to be a boolean`);
	}

	return true;
}

function validateGeometry(value: any, key: string) {
	try {
		stringify(value);
	} catch {
		throw new InvalidQueryException(`"${key}" has to be a valid GeoJSON object`);
	}

	return true;
}

function validateAlias(alias: any) {
	if (isPlainObject(alias) === false) {
		throw new InvalidQueryException(`"alias" has to be an object`);
	}

	for (const [key, value] of Object.entries(alias)) {
		if (typeof key !== 'string') {
			throw new InvalidQueryException(`"alias" key has to be a string. "${typeof key}" given.`);
		}

		if (typeof value !== 'string') {
			throw new InvalidQueryException(`"alias" value has to be a string. "${typeof key}" given.`);
		}

		if (key.includes('.') || value.includes('.')) {
			throw new InvalidQueryException(`"alias" key/value can't contain a period character \`.\``);
		}
	}
}
