import { ParseError, parse } from "./src/parser.ts";
import { render, setConfig } from "./src/render.ts";

// cli: render a uml dsl file to svg
//
//   deno run --allow-read main.ts diagram.uml > diagram.svg
//   deno run --allow-read --allow-write main.ts diagram.uml -o diagram.svg
//   deno run main.ts        (renders a built-in sample)

const USAGE = `usage: deno run --allow-read main.ts [file.uml] [-o out.svg] [--config config.json]

renders a uml dsl file to svg on stdout. with no file, renders a
built-in sample. -o writes to a file instead (needs --allow-write).
--config overrides the built-in defaults; only the fields present in
the file are changed, everything else keeps its default.`;

function parseArgs(
  args: string[],
): { path?: string; out?: string; config?: string } {
  let path: string | undefined;
  let out: string | undefined;
  let config: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      Deno.exit(0);
    } else if (arg === "-o" || arg === "--out") {
      out = args[++i];
      if (out === undefined) {
        console.error("error: -o requires a file name");
        Deno.exit(2);
      }
    } else if (arg === "-c" || arg === "--config") {
      config = args[++i];
      if (config === undefined) {
        console.error("error: --config requires a file name");
        Deno.exit(2);
      }
    } else if (arg.startsWith("--config=")) {
      config = arg.slice("--config=".length);
    } else if (arg.startsWith("-")) {
      console.error(`error: unknown option "${arg}"\n\n${USAGE}`);
      Deno.exit(2);
    } else {
      path = arg;
    }
  }
  return { path, out, config };
}

if (import.meta.main) {
  const { path, out, config } = parseArgs(Deno.args);

  if (config !== undefined) {
    try {
      setConfig(JSON.parse(await Deno.readTextFile(config)));
    } catch (e) {
      console.error(`error: cannot read config ${config}: ${(e as Error).message}`);
      Deno.exit(1);
    }
  }

  let source: string;
  try {
    source = path !== undefined ? await Deno.readTextFile(path) : "";
  } catch (e) {
    console.error(`error: cannot read ${path}: ${(e as Error).message}`);
    Deno.exit(1);
  }

  let svg: string;
  try {
    svg = render(parse(source));
  } catch (e) {
    if (e instanceof ParseError) {
      // the message already carries line and column
      console.error(`parse error: ${e.message}`);
      Deno.exit(1);
    }
    throw e;
  }

  if (out !== undefined) {
    await Deno.writeTextFile(out, svg + "\n");
  } else {
    console.log(svg);
  }
}
