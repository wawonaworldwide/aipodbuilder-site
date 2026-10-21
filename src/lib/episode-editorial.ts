import transcript from '../content/transcripts/s01.txt?raw';
export const transcripts: Record<string, string> = { s01: transcript };
export const discoveryLabels: Record<
  string,
  { title: string; description: string }
> = {
  s01: {
    title: 'A Day With My AI Print-on-Demand Pipeline (I Just Click Approve)',
    description:
      'One day with a POD pipeline: overnight research, three human approval gates, automatic listing prep.',
  },
  's01-01-pipeline-map': {
    title: 'Starter prompt: map my POD pipeline',
    description: 'Plan the stages and the three human gates before building.',
  },
  's01-02-research-inbox': {
    title: 'Starter prompt: a research inbox',
    description:
      'Approve or reject niche ideas from a CSV, with Amazon search links.',
  },
  's01-03-approval-desk': {
    title: 'Starter prompt: an approval desk',
    description:
      'Approve, reject with reasons, or regenerate designs in a folder.',
  },
};
