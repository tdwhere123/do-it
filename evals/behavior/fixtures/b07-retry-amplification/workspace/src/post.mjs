export const attempts = [];

export function post(id) {
  attempts.push(id);
  return "ok";
}
