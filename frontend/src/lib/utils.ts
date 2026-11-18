import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'headline-lg',
            'headline-lg-mobile',
            'metric-lg',
            'headline-md',
            'headline-sm',
            'body-lg',
            'body-md',
            'body-sm',
            'label-md',
            'label-sm',
            'caption',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return customTwMerge(clsx(inputs));
}
