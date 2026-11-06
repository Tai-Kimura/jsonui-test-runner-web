import { AssertionExecutor } from './AssertionExecutor';

/**
 * `assert: "screen"` says one thing from one read. The Android driver read
 * "'x' is not displayed; displayed screens are [x]" at load 70, and this one
 * asked the same two questions apart: a count, then the list.
 */
function pageWhere(present: () => string[], visible = true) {
  return {
    locator(selector: string) {
      if (selector === '[data-screen]') {
        return { evaluateAll: async () => present() };
      }
      const id = /data-screen="(.*)"/.exec(selector)?.[1] ?? '';
      return {
        count: async () => present().filter((p) => p === id).length,
        first: () => ({ isVisible: async () => visible }),
      };
    },
    url: () => 'http://localhost/page',
  };
}

const wait = (page: unknown, screen: string) =>
  new AssertionExecutor(page as never).waitForScreenMarker(screen, 0).then(
    () => '',
    (e: Error) => e.message
  );

describe('a screen verdict and its sentence', () => {
  it('never names the wanted screen as displayed while saying it is not (a count that misses, a list that holds it)', async () => {
    let lists = 0;
    const page = {
      locator(selector: string) {
        if (selector === '[data-screen]') {
          return { evaluateAll: async () => (lists++, ['detail']) };
        }
        return {
          count: async () => 0, // the older read: the count came first and missed
          first: () => ({ isVisible: async () => true }),
        };
      },
      url: () => 'http://localhost/page',
    };
    expect(await wait(page, 'detail')).toBe('');
    expect(lists).toBe(1);
  });

  it('a wrong screen stays red and is named', async () => {
    expect(await wait(pageWhere(() => ['other']), 'detail')).toContain(
      `previous-screen-only: 'detail' is not displayed; displayed screens are ["other"]`
    );
  });

  it('a present but hidden marker stays red', async () => {
    expect(await wait(pageWhere(() => ['detail'], false), 'detail')).toContain('marker-not-displayed');
  });

  it('no markers stays marker-absent', async () => {
    expect(await wait(pageWhere(() => []), 'detail')).toContain('marker-absent');
  });
});
