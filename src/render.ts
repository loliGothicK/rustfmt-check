export function plural(value: number, suffix = 's'): string {
    return value === 1 ? '' : suffix;
}
