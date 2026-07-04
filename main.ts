import { ParseError, parse } from "./src/parser.ts";
import { render } from "./src/render.ts";

// cli: render a uml dsl file to svg
//
//   deno run --allow-read main.ts diagram.uml > diagram.svg
//   deno run --allow-read --allow-write main.ts diagram.uml -o diagram.svg
//   deno run main.ts        (renders a built-in sample)

// online shop domain: a Catalog and an Orders region, an inheritance pair
// converging on the Entity interface, member-anchored associations (one
// explicit, one inferred from a param type), both diamonds, dashed
// dependencies, geometry-expression @via corners, and both note styles
const SAMPLE = `
@bg(#fafafa)

interface Entity @pos(400, 40) @bg(#f3f4f6) {
    + id: UUID
    + createdAt: Time
}

class User @pos(40, 40) @bg(#e0e7ff) {
    + name: String
    + orders: List<Order>
}

class Admin @pos(40, 280) @bg(#e0f2fe) {
    + permissions: List<String>
}

class Category @pos(400, 280) @bg(#dcfce7) {
    + title: String
    + products: List<Product>
}

class Product @pos(760, 280) @bg(#dcfce7) {
    + title: String
    + price: Money
    - stock: Int
}

class Order @pos(400, 560) @bg(#fce7f3) {
    + items: List<OrderItem>
    + total: Money
    + status: Status
}

class OrderItem @pos(760, 560) @bg(#fce7f3) {
    + product: Product
    + qty: Int
}

class Payment @pos(40, 560) @bg(#fef9c3) {
    + amount: Money
    + charge(order: Order): Bool
}

Admin --|> User
Category --|> Entity
Product --|> Entity

Product --o Category
OrderItem --* Order : "contains"
OrderItem.product --> Product @via((right(OrderItem)+24, cy(OrderItem)), (right(Product)+24, cy(Product))) @line(ortho)
User.orders --> Order : "places"
Payment ..> Order
Admin ..> Category : "curates"

note "price is frozen per order" -> OrderItem
note "catalog is synced nightly from the ERP"

region Catalog @bg(#f0fdf4) { Category Product }
region Orders @bg(#fdf2f8) { Order OrderItem Payment }
`;

const USAGE = `usage: deno run --allow-read main.ts [file.uml] [-o out.svg]

renders a uml dsl file to svg on stdout. with no file, renders a
built-in sample. -o writes to a file instead (needs --allow-write).`;

function parseArgs(args: string[]): { path?: string; out?: string } {
  let path: string | undefined;
  let out: string | undefined;
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
    } else if (arg.startsWith("-")) {
      console.error(`error: unknown option "${arg}"\n\n${USAGE}`);
      Deno.exit(2);
    } else {
      path = arg;
    }
  }
  return { path, out };
}

if (import.meta.main) {
  const { path, out } = parseArgs(Deno.args);

  let source: string;
  try {
    source = path !== undefined ? await Deno.readTextFile(path) : SAMPLE;
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
