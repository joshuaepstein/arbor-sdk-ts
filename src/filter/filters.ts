export interface Filter {
  filter(value: string): string;
}

/** `AcademicUnit` → `Academic-Unit`, `HTMLParser` → `HTML-Parser`. */
export class CamelCaseToDash implements Filter {
  filter(value: string): string {
    return value
      .replace(/(?<=[A-Z])([A-Z]+)([A-Z][A-Za-z])/g, '$1-$2')
      .replace(/(?<=[a-z0-9])([A-Z])/g, '-$1');
  }
}

/** Naive English pluralisation, identical to the PHP SDK's rules. */
export class PluralizeFilter implements Filter {
  protected exceptions: Record<string, string> = {};

  filter(value: string): string {
    const exception = this.exceptions[value.toLowerCase()];
    if (exception !== undefined) return exception;

    if (value.endsWith('ch')) return `${value}es`;

    switch (value.slice(-1)) {
      case 's':
        return `${value.slice(0, -1)}ses`;
      case 'y':
        return value.endsWith('ay') ? `${value}s` : `${value.slice(0, -1)}ies`;
      default:
        return `${value}s`;
    }
  }
}
