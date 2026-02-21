type MaybeFunctionError = {
  message?: string;
  context?: {
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };
};

export async function getFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const fnError = error as MaybeFunctionError | null;

  if (fnError?.context?.json) {
    try {
      const body = await fnError.context.json() as { error?: string; message?: string };
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      // Ignore parse errors and fall through to other message sources.
    }
  }

  if (fnError?.context?.text) {
    try {
      const bodyText = await fnError.context.text();
      if (bodyText) return bodyText;
    } catch {
      // Ignore parse errors and fall through to other message sources.
    }
  }

  if (fnError?.message) return fnError.message;
  if (error instanceof Error && error.message) return error.message;

  return fallback;
}
