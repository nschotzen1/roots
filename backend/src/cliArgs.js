export const parseCliArgs = (argv) => {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const withoutPrefix = token.slice(2);

    if (withoutPrefix.startsWith('no-')) {
      args[withoutPrefix.slice(3)] = false;
      continue;
    }

    const [rawKey, inlineValue] = withoutPrefix.split('=');
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[rawKey] = true;
      continue;
    }

    args[rawKey] = next;
    i += 1;
  }

  return args;
};
