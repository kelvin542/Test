import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const [html, css, color, app] = await Promise.all(
  ['index.html', 'style.css', 'color.js', 'app.js'].map(file => readFile(path.join(root, file), 'utf8')),
);
const colorFunctions = color.replace(/^export /gm, '');
const application = app.replace(/^import[^\n]*from '\.\/color\.js';\r?\n/, '');
if (application === app) throw new Error('Não foi possível localizar o import do módulo de cor.');
const embedded = `${colorFunctions}\n${application}`.replace(/<\/script/gi, '<\\/script');
const standalone = html
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">\n${embedded}\n</script>`)
  .replace('class="brand" href="./"', 'class="brand" href="#"');
if (standalone === html || standalone.includes('src="app.js"')) throw new Error('Falha ao incorporar os arquivos.');
if (!standalone.includes(css) || standalone.includes('href="style.css"')) throw new Error('Falha ao incorporar o CSS.');
const output = path.join(root, 'dist', 'Tom-Exato.html');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, standalone);
const siteDirectory = path.join(root, 'dist', 'site');
await mkdir(siteDirectory, { recursive: true });
await writeFile(path.join(siteDirectory, 'index.html'), standalone);
if (process.argv.includes('--pages')) {
  const docsDirectory = path.join(root, 'docs');
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(path.join(docsDirectory, 'index.html'), standalone);
  console.log('Versão do GitHub Pages atualizada em docs/index.html');
}
console.log(`Aplicativo independente gerado em ${output}`);
console.log(`Site pronto para hospedagem em ${siteDirectory}`);
