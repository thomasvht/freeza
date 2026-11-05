/** Default display name: the part before the first `.` or `@`, first letter capitalised. */
export function defaultDisplayName(email: string): string {
  const local = email.split(/[.@]/)[0] ?? '';
  const name = local.charAt(0).toUpperCase() + local.slice(1);
  return (name || 'Member').slice(0, 30);
}
