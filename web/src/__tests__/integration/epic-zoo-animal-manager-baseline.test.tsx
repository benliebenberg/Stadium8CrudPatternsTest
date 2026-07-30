/**
 * Per-epic baseline — Epic `zoo-animal-manager`.
 *
 * Cross-story invariants of the shared app shell, asserted ONCE here instead of being
 * re-asserted by every story's test file. Created with story 2 because story 2 is the
 * story that introduces the shell (`epicIntroducesSharedSurface: true`; story 1 is
 * non-routable and renders nothing).
 *
 * Scope, deliberately narrow:
 * - The composed shell exposes exactly ONE `main` landmark, and pages render inside it.
 * - The toast infrastructure stays mounted for every screen in the epic.
 *
 * NOT here: role-gating (this project has exactly one kind of user and no roles at all —
 * project.md §Roles & Permissions, brief BR15), nav-link presence and the absence of any
 * sign-in/account/sign-out affordance (story 2's AC-1, `playwright`-tagged), and the
 * accessibility scan (story 2's AC-6 — a real-browser `@axe-core/playwright` scan, which
 * sees the contrast, layout and focus order jsdom cannot).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * WHY THE `main` LANDMARK IS A BASELINE CONCERN
 * ─────────────────────────────────────────────────────────────────────────────────
 * The starter template renders a `<main>` in `layout.tsx` AND another in `page.tsx`.
 * Two `main` landmarks is an accessibility failure, and it is the exact mistake Critical
 * Rule 6 warns about: story 2's shell must REPLACE layout's wrapper, not nest inside it.
 * Every later page in this epic (`/habitats`, `/animals/[id]`) inherits whatever this
 * composition settles on, so it belongs to the epic, not to one story.
 *
 * Later stories in this epic must NOT re-assert these invariants — extend this file only
 * if they introduce a genuinely new shared surface.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RootLayout from '@/app/layout';
import HomePage from '@/app/page';
import { useToast } from '@/contexts/ToastContext';

/**
 * The app-router navigation hooks: the shell marks the current section from the path,
 * and jsdom has no router context to read.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * `next/font/google` is a build-time loader — it only works inside Next's compiler, and
 * throws when imported by a test runner. project.md §Styling loads Inter, Space Grotesk
 * and Roboto Mono through it from the root layout, so the layout stays importable here.
 */
vi.mock('next/font/google', () => {
  const font = () => ({
    className: 'font-stub',
    variable: '--font-stub',
    style: { fontFamily: 'font-stub' },
  });
  return { Inter: font, Space_Grotesk: font, Roboto_Mono: font };
});

const PAGE_SLOT_CONTENT = 'a page rendered into the shell';
const TOAST_TITLE = 'Animal updated successfully';
const TOAST_MESSAGE = 'The backend confirmed the change.';

/**
 * A consumer of the real `ToastContext`, standing in for the write screens of stories
 * 6–9 (which raise their confirmations through `useToast()`). It replaces no production
 * code: `RootLayout`, `ToastProvider`, `ToastContainer` and `Toast` are all the real
 * implementations — this only supplies the click that a user would make there.
 */
function ToastRaisingScreen() {
  const { showToast } = useToast();

  return (
    <button
      type="button"
      onClick={() =>
        showToast({
          variant: 'success',
          title: TOAST_TITLE,
          message: TOAST_MESSAGE,
        })
      }
    >
      save the animal
    </button>
  );
}

describe('Epic zoo-animal-manager: shared app shell baseline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Composing the root layout in jsdom logs "In HTML, <html> cannot be a child of
  // <div>" — expected noise from rendering a document-level component into a test
  // container, not a defect. Asserting the landmark on the layout+page composition is
  // the only way to catch a duplicated `main`, which is the mistake worth catching.
  it('exposes exactly one main landmark once the shell wraps a page', () => {
    // A never-answering roster request: this test is about the composed landmarks, and
    // the roster's own states belong to story 2's test file.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    render(
      <RootLayout>
        <HomePage />
      </RootLayout>,
    );

    // One, not two: the shell owns the landmark and layout no longer adds its own.
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('renders every page inside that single main landmark', () => {
    render(
      <RootLayout>
        <p>{PAGE_SLOT_CONTENT}</p>
      </RootLayout>,
    );

    // A landmark that the page's content sits outside of is decorative, not a landmark.
    expect(
      within(screen.getByRole('main')).getByText(PAGE_SLOT_CONTENT),
    ).toBeInTheDocument();
  });

  it('keeps the toast infrastructure mounted for every screen in the epic', async () => {
    const user = userEvent.setup();

    render(
      <RootLayout>
        <ToastRaisingScreen />
      </RootLayout>,
    );

    await user.click(screen.getByRole('button', { name: /save the animal/i }));

    // Stories 6–9 report every write outcome through this one channel (NFR-5), so the
    // shell rework must keep both halves mounted: `ToastProvider` (or `useToast()`
    // throws) and `ToastContainer` (or nothing is ever displayed).
    expect(await screen.findByText(TOAST_TITLE)).toBeInTheDocument();
    expect(screen.getByText(TOAST_MESSAGE)).toBeInTheDocument();
  });
});
