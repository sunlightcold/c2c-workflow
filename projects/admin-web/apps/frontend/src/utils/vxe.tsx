import type { TagProps } from 'ant-design-vue/es/tag';
import type { VxeGridPropTypes } from 'vxe-table';

import { Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

type RecordRow = Record<string, unknown>;
type TagMap<V> = Partial<Record<PropertyKey, V>>;

interface SlotColumnParams<R extends object> {
  cellValue?: unknown;
  column: VxeGridPropTypes.Column<R>;
  row: R;
}

export interface MVxeColumnParams<R extends object = RecordRow> {
  column: VxeGridPropTypes.Column<R>;
}

export interface MVxeTagColumnParams<R extends object = RecordRow>
  extends MVxeColumnParams<R> {
  props?: TagProps;
  cellValueMap?: TagMap<string>;
  colorMap?: TagMap<TagProps['color']>;
}

export interface MVxeTagsColumnParams<R extends object = RecordRow>
  extends MVxeTagColumnParams<R> {
  fieldNames?: {
    label: string;
  };
  stringList?: boolean;
}

export type MVxeDateColumnParams<R extends object = RecordRow> =
  MVxeColumnParams<R>;

function resolveMapValue<T>(map: TagMap<T> | undefined, value: unknown) {
  if (!map) {
    return undefined;
  }

  return map[String(value)];
}

function getColumnFieldValue<R extends object>(
  row: R,
  column: VxeGridPropTypes.Column<R>,
) {
  const field = column.field as keyof R | undefined;
  return field ? row[field] : undefined;
}

export const VxeUtils = {
  tag: {
    getColumn<R extends object>(
      params: MVxeTagColumnParams<R>,
    ): VxeGridPropTypes.Column<R> {
      const { column, props = {}, colorMap, cellValueMap: formatMap } = params;
      const { color, ...otherProps } = props;
      return {
        align: 'center',
        slots: {
          default(slotParams: SlotColumnParams<R>) {
            const { row } = slotParams;
            const slotColumn = slotParams.column;
            const cellValue = getColumnFieldValue(row, slotColumn);
            const formatValue =
              typeof slotColumn?.formatter === 'function'
                ? slotColumn.formatter({
                    cellValue,
                    column: slotColumn as never,
                    row,
                  })
                : cellValue;
            const tagColor = resolveMapValue(colorMap, formatValue) ?? color;
            const label =
              resolveMapValue(formatMap, formatValue) ?? formatValue;

            return (
              <Tag {...otherProps} color={tagColor}>
                {label as string}
              </Tag>
            );
          },
        },
        ...column,
      };
    },
  },
  tags: {
    getColumn<R extends object>(
      params: MVxeTagsColumnParams<R>,
    ): VxeGridPropTypes.Column<R> {
      const {
        column,
        props = {},
        colorMap,
        cellValueMap: formatMap,
        fieldNames = { label: 'name' },
        stringList = false,
      } = params;
      const { color, ...otherProps } = props;
      return {
        align: 'center',
        slots: {
          default(slotParams: SlotColumnParams<R>) {
            const cellValue = getColumnFieldValue(
              slotParams.row,
              slotParams.column,
            );
            const items = Array.isArray(cellValue) ? cellValue : [];

            return items.map((item) => {
              const val =
                stringList || typeof item !== 'object' || item === null
                  ? item
                  : (item as Record<string, unknown>)[fieldNames.label];
              const tagColor = resolveMapValue(colorMap, val) ?? color;
              const label = resolveMapValue(formatMap, val) ?? val;

              return (
                <Tag {...otherProps} color={tagColor}>
                  {label as string}
                </Tag>
              );
            });
          },
        },
        ...column,
      };
    },
  },
  formatDate: (
    date: Date | number | string,
    format = 'YYYY-MM-DD HH:mm:ss',
  ) => {
    return dayjs(date).format(format);
  },
};
