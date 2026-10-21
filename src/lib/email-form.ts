type Turnstile = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let ready: Promise<Turnstile> | undefined;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  ready ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(Error('Bot check unavailable'));
    script.onerror = () => {
      script.remove();
      ready = undefined;
      reject(Error('Bot check unavailable'));
    };
    document.head.append(script);
  });
  return ready;
}
export function setupEmailForms() {
  document
    .querySelectorAll<HTMLFormElement>('.email-capture')
    .forEach((form) => {
      if (form.dataset.ready) return;
      form.dataset.ready = 'true';
      let completed = false;
      let token = '';
      let submitted = false;
      let widget: string | undefined;
      let api: Turnstile | undefined;
      let loading: Promise<void> | undefined;
      const status = form.querySelector<HTMLElement>('[role="status"]')!;
      const email = form.querySelector<HTMLInputElement>('[name="email"]')!;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      )!;
      const init = () =>
        (loading ??= loadTurnstile()
          .then((ts) => {
            api = ts;
            widget = ts.render(
              form.querySelector<HTMLElement>('[data-turnstile]')!,
              {
                sitekey: form.dataset.sitekey,
                action: 'subscribe',
                size: 'flexible',
                callback: (value: string) => {
                  token = value;
                  if (!submitted)
                    status.textContent =
                      'Bot check complete. Ready when you are.';
                },
                'expired-callback': () => {
                  if (completed) return;
                  token = '';
                  status.textContent = 'Please complete the bot check again.';
                },
                'error-callback': () => {
                  if (completed) return;
                  token = '';
                  status.textContent =
                    'The bot check could not load. Please try again.';
                },
              },
            );
          })
          .catch(() => {
            loading = undefined;
            status.textContent =
              'The bot check could not load. Check your connection and try again.';
          }));
      form.addEventListener(
        'focusin',
        () => {
          void init();
        },
        { once: true },
      );
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (button.disabled) return;
        email.removeAttribute('aria-invalid');
        if (!form.reportValidity()) return;
        await init();
        if (!token) {
          status.textContent = 'Please finish the bot check, then try again.';
          status.focus();
          return;
        }
        const body = Object.fromEntries(new FormData(form));
        const source = new URL(location.pathname, location.origin);
        for (const key of [
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'utm_term',
          'utm_content',
        ]) {
          const value = new URLSearchParams(location.search).get(key);
          if (value) source.searchParams.set(key, value);
        }
        if (form.getAttribute('action') === '/api/subscribe')
          body.source = source.pathname + source.search;
        body['cf-turnstile-response'] = token;
        let saved = false;
        submitted = true;
        button.disabled = true;
        form.setAttribute('aria-busy', 'true');
        status.textContent = 'Saving your preferences…';
        try {
          const response = await fetch(
            form.getAttribute('action') || '/api/subscribe',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(15000),
            },
          );
          const result = (await response.json()) as {
            ok?: boolean;
            message?: string;
            field?: string;
          };
          status.textContent =
            result.message || 'Signup is taking a break. Please try again.';
          if (response.ok && result.ok) {
            saved = true;
            completed = true;
            form.querySelector('fieldset')!.hidden = true;
            email.value = '';
            status.focus();
          } else if (result.field === 'email') {
            email.setAttribute('aria-invalid', 'true');
            email.focus();
          } else status.focus();
        } catch {
          status.textContent =
            'Signup could not connect. Please try again in a moment.';
          status.focus();
        } finally {
          button.disabled = false;
          form.removeAttribute('aria-busy');
          token = '';
          if (!saved && api && widget) api.reset(widget);
        }
      });
    });
}
