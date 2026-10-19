/** Padded standard-base64 syntax, checked in linear time without regex backtracking. */
export function isBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  let end = value.length;
  if (value.endsWith('=')) end--;
  if (value.endsWith('==')) end--;
  for (let index = 0; index < end; index++) {
    const code = value.charCodeAt(index);
    if (!(
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47
    ))
      return false;
  }
  return true;
}
