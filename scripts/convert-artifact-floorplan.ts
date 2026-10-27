/*
 * Converts the JSON exported from the earlier floorplan prototype ("floorplan data schema 1.0.0")
 * into a BYDH project file you can import via Project menu > Import JSON.
 *
 *   npx vite-node scripts/convert-artifact-floorplan.ts <input.json> <output.json> --name "My house"
 *
 * Keep real plans in docs/plans/ (gitignored); never commit them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  ArtifactFloorplanSchema,
  convertArtifactFloorplan,
  formatReport,
} from '../src/domain/io/artifactFloorplan';
import { parseProjectFile, serializeProjectFile, toProjectFile } from '../src/domain/schema';

function main(): void {
  const args = process.argv.slice(2);
  const nameAt = args.indexOf('--name');
  const name = nameAt >= 0 ? (args[nameAt + 1] ?? '') : 'Imported house';
  const [input, output] = args.filter((a, i) => !a.startsWith('--') && i !== nameAt + 1);
  if (!input || !output || !name) {
    console.error(
      'Usage: vite-node scripts/convert-artifact-floorplan.ts <in.json> <out.json> --name "<name>"',
    );
    process.exit(2);
  }
  const parsed = ArtifactFloorplanSchema.safeParse(JSON.parse(readFileSync(input, 'utf8')));
  if (!parsed.success) {
    console.error('Input is not a supported floorplan export:');
    for (const issue of parsed.error.issues.slice(0, 10))
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }
  const { project, report } = convertArtifactFloorplan(parsed.data, name);
  const text = serializeProjectFile(toProjectFile(project));
  const check = parseProjectFile(text);
  if (!check.ok) {
    console.error(`Generated file failed validation: ${check.message}`);
    for (const issue of check.issues ?? []) console.error(`  ${issue}`);
    process.exit(1);
  }
  writeFileSync(output, text);
  console.log(formatReport(report));
  console.log(`\nWrote ${output} (validated with parseProjectFile).`);
}

main();
