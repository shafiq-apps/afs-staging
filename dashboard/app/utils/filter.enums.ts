/**
 * Filter Enums
 * Enum values matching the GraphQL schema in app/modules/graphql/schema/filters.schema.ts
 */

export enum DisplayType {
  LIST = "LIST",
  DROPDOWN = "DROPDOWN",
  GRID = "GRID",
  RANGE = "RANGE",
  SWATCH = "SWATCH",
  COLOR_SWATCH = "COLOR_SWATCH",
  CHECKBOX = "CHECKBOX",
  RADIO = "RADIO",
  SQUARE = "SQUARE",
}

export enum SelectionType {
  SINGLE = "SINGLE",
  MULTIPLE = "MULTIPLE",
  RANGE = "RANGE",
}

export enum SortOrder {
  ASCENDING = "ASCENDING",
  DESCENDING = "DESCENDING",
  MANUAL = "MANUAL",
}

export enum FilterOptionStatus {
  PUBLISHED = "PUBLISHED",
  UNPUBLISHED = "UNPUBLISHED",
}

export enum FilterStatus {
  PUBLISHED = "PUBLISHED",
  UNPUBLISHED = "UNPUBLISHED",
}

export enum PaginationType {
  SCROLL = "SCROLL",
  LOAD_MORE = "LOAD_MORE",
  PAGES = "PAGES",
  INFINITE_SCROLL = "INFINITE_SCROLL",
}

export enum TextTransform {
  NONE = "NONE",
  UPPERCASE = "UPPERCASE",
  LOWERCASE = "LOWERCASE",
  CAPITALIZE = "CAPITALIZE",
}

export enum DeploymentChannel {
  APP = "APP",
  THEME = "THEME",
  ADMIN = "ADMIN",
}

export enum TargetScope {
  ALL = "all",
  ENTITLED = "entitled",
}

export enum FilterOrientation {
  VERTICAL = "vertical",
  HORIZONTAL = "horizontal",
}

export enum DefaultView {
  GRID = "grid",
  LIST = "list",
}

/**
 * Helper function to safely convert string to enum value
 */
export function toDisplayType(value: string | undefined | null): DisplayType {
  if (!value) return DisplayType.LIST;
  const upper = value.toUpperCase();
  return Object.values(DisplayType).includes(upper as DisplayType)
    ? (upper as DisplayType)
    : DisplayType.LIST;
}

export function toSelectionType(value: string | undefined | null): SelectionType {
  if (!value) return SelectionType.MULTIPLE;
  const upper = value.toUpperCase();
  return Object.values(SelectionType).includes(upper as SelectionType)
    ? (upper as SelectionType)
    : SelectionType.MULTIPLE;
}

export function toSortOrder(value: string | undefined | null): SortOrder {
  if (!value) return SortOrder.ASCENDING;
  const upper = value.toUpperCase();
  return Object.values(SortOrder).includes(upper as SortOrder)
    ? (upper as SortOrder)
    : SortOrder.ASCENDING;
}

export function toFilterOptionStatus(value: string | undefined | null): FilterOptionStatus {
  if (!value) return FilterOptionStatus.PUBLISHED;
  const upper = value.toUpperCase();
  return Object.values(FilterOptionStatus).includes(upper as FilterOptionStatus)
    ? (upper as FilterOptionStatus)
    : FilterOptionStatus.PUBLISHED;
}

export function toFilterStatus(value: string | undefined | null): FilterStatus {
  if (!value) return FilterStatus.PUBLISHED;
  const upper = value.toUpperCase();
  return Object.values(FilterStatus).includes(upper as FilterStatus)
    ? (upper as FilterStatus)
    : FilterStatus.PUBLISHED;
}

export function toPaginationType(value: string | undefined | null): PaginationType {
  if (!value) return PaginationType.SCROLL;
  const upper = value.toUpperCase();
  return Object.values(PaginationType).includes(upper as PaginationType)
    ? (upper as PaginationType)
    : PaginationType.SCROLL;
}

export function toTextTransform(value: string | undefined | null): TextTransform {
  if (!value) return TextTransform.NONE;
  const upper = value.toUpperCase();
  return Object.values(TextTransform).includes(upper as TextTransform)
    ? (upper as TextTransform)
    : TextTransform.NONE;
}

export function toDeploymentChannel(value: string | undefined | null): DeploymentChannel {
  if (!value) return DeploymentChannel.APP;
  const upper = value.toUpperCase();
  return Object.values(DeploymentChannel).includes(upper as DeploymentChannel)
    ? (upper as DeploymentChannel)
    : DeploymentChannel.APP;
}

export function toTargetScope(value: string | undefined | null): TargetScope {
  if (!value) return TargetScope.ALL;
  const lower = value.toLowerCase();
  return Object.values(TargetScope).includes(lower as TargetScope)
    ? (lower as TargetScope)
    : TargetScope.ALL;
}

export function toFilterOrientation(value: string | undefined | null): FilterOrientation {
  if (!value) return FilterOrientation.VERTICAL;
  const lower = value.toLowerCase();
  return Object.values(FilterOrientation).includes(lower as FilterOrientation)
    ? (lower as FilterOrientation)
    : FilterOrientation.VERTICAL;
}

export function toDefaultView(value: string | undefined | null): DefaultView {
  if (!value) return DefaultView.GRID;
  const lower = value.toLowerCase();
  return Object.values(DefaultView).includes(lower as DefaultView)
    ? (lower as DefaultView)
    : DefaultView.GRID;
}

