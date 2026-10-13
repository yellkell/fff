/** Whether you've been through EMBER's tutorial: remembered, like the career. */

const KEY = 'flux-tutorial';

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    /* a private window just won't remember */
  }
}
