import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// .claude/ is the source of truth for agent skills and subagents.
// .agents/ (Antigravity, Cursor and other tools) and .codex/ are generated
// from it: skills are copied verbatim, and subagents get the same body under
// each tool's own frontmatter.
//
//   node agents.mjs sync   rewrite the generated copies
//   node agents.mjs check  exit 1 if a generated copy has drifted

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const source = path.join(root, '.claude');

function listFiles(dir, prefix = '') {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.DS_Store') {
      return [];
    }

    const relative = path.join(prefix, entry.name);

    // a symlink would be listed as a file and later removed as stale
    if (entry.isSymbolicLink()) {
      throw new Error(
        `${path.join(dir, entry.name)} is a symlink. Replace it with real files.`,
      );
    }

    return entry.isDirectory()
      ? listFiles(path.join(dir, entry.name), relative)
      : [relative];
  });
}

function splitFrontmatter(text) {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);

  if (!match) {
    throw new Error('missing frontmatter');
  }

  return { frontmatter: match[0], body: text.slice(match[0].length) };
}

function expectedSkills() {
  const target = path.join(root, '.agents', 'skills');

  if (!existsSync(target)) {
    return { files: new Map(), stale: [] };
  }

  const sourceDir = path.join(source, 'skills');
  const sourceFiles = listFiles(sourceDir);
  const files = new Map();

  // without this guard every generated skill would be deleted as stale
  if (sourceFiles.length === 0) {
    throw new Error(
      `${path.relative(root, sourceDir)} is missing or empty. Refusing to sync.`,
    );
  }

  for (const file of sourceFiles) {
    files.set(
      path.join(target, file),
      readFileSync(path.join(sourceDir, file), 'utf8'),
    );
  }

  const stale = listFiles(target)
    .map((file) => path.join(target, file))
    .filter((file) => !files.has(file));

  return { files, stale };
}

function expectedAgents() {
  const files = new Map();
  const notes = [];
  const agentsDir = path.join(root, '.agents', 'agents');
  const codexDir = path.join(root, '.codex', 'agents');

  for (const file of listFiles(path.join(source, 'agents'))) {
    if (!file.endsWith('.md')) {
      continue;
    }

    const name = path.basename(file, '.md');
    const sourceText = readFileSync(path.join(source, 'agents', file), 'utf8');
    const { frontmatter, body } = splitFrontmatter(sourceText);

    if (existsSync(agentsDir)) {
      const target = path.join(agentsDir, file);

      const targetFrontmatter = existsSync(target)
        ? splitFrontmatter(readFileSync(target, 'utf8')).frontmatter
        : frontmatter;

      files.set(target, targetFrontmatter + body);
    }

    if (existsSync(codexDir)) {
      const target = path.join(codexDir, `${name}.toml`);

      if (!existsSync(target)) {
        notes.push(
          `${path.relative(root, target)} does not exist. Create it with name and description, then run sync.`,
        );
        continue;
      }

      const instructions = body.replace(/^\n+/, '');

      if (instructions.includes("'''")) {
        throw new Error(`${file} contains ''' and cannot be written to TOML`);
      }

      const current = readFileSync(target, 'utf8');
      const value = `developer_instructions = '''\n${instructions}'''\n`;

      // replace only this key's value, keeping every other key and table
      const key =
        /^developer_instructions[ \t]*=[ \t]*(?:'''[\s\S]*?'''|"""[\s\S]*?(?<!\\)"""|'[^'\n]*'|"(?:[^"\\\n]|\\.)*")[ \t]*(?:\r?\n|$)/m;

      if (!key.test(current) && /^\[/m.test(current)) {
        throw new Error(
          `${path.relative(root, target)} has no top-level developer_instructions. Add one above its first table.`,
        );
      }

      files.set(
        target,
        key.test(current)
          ? current.replace(key, () => value)
          : `${current.replace(/\s*$/, '\n')}${value}`,
      );
    }
  }

  return { files, notes };
}

function main() {
  const mode = process.argv[2];

  if (mode !== 'sync' && mode !== 'check') {
    console.error('Usage: node agents.mjs <sync|check>');
    process.exit(1);
  }

  const skills = expectedSkills();
  const agents = expectedAgents();
  const expected = new Map([...skills.files, ...agents.files]);

  for (const note of agents.notes) {
    console.warn(note);
  }

  // stale files go first: on a case-insensitive filesystem a case-only
  // rename would otherwise be written into the old file and then deleted
  if (mode === 'sync') {
    for (const file of skills.stale) {
      rmSync(file);
      console.log(`removed ${path.relative(root, file)}`);

      let dir = path.dirname(file);

      while (
        dir !== path.join(root, '.agents', 'skills') &&
        !readdirSync(dir).length
      ) {
        rmSync(dir, { recursive: true });
        dir = path.dirname(dir);
      }
    }
  }

  const drifted = [...expected].filter(
    ([file, content]) =>
      !existsSync(file) || readFileSync(file, 'utf8') !== content,
  );

  if (mode === 'check') {
    const problems = [
      ...drifted.map(([file]) => `out of sync: ${path.relative(root, file)}`),
      ...skills.stale.map(
        (file) => `not in .claude/skills: ${path.relative(root, file)}`,
      ),
    ];

    if (problems.length > 0) {
      console.error(problems.join('\n'));
      console.error('\nEdit .claude/ and run `pnpm run agents:sync`.');
      process.exit(1);
    }

    console.log('Agent files are in sync with .claude/.');
    return;
  }

  for (const [file, content] of drifted) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`wrote ${path.relative(root, file)}`);
  }
}

main();
