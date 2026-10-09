export function makePipeline(stages) {
  return (input) => stages.reduce((value, stage) => stage(value), input);
}
