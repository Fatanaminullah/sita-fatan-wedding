/**
 * Display names for inviter keys. The keys themselves are data: primary key
 * of `inviters`, foreign key on guests and profiles, and what the sheet
 * import matches against at cut-over, so they are not renamed. This map is
 * the one place the interface says something different from the database.
 */
const INVITER_LABEL: Record<string, string> = {
  'Mama Fatan': 'Umi Fatan',
  'Papa Fatan': 'Abi Fatan',
}

export function inviterLabel(key: string): string {
  return INVITER_LABEL[key] ?? key
}
