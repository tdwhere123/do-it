import { makePipeline } from './pipeline.mjs';

const identity = makePipeline([(value) => value]);

export function invoice(amounts) {
  let total = 0;
  for (const amount of amounts) total += amount;
  return identity(total);
}
