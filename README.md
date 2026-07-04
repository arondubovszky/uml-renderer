## Example

![example diagram](readme.svg)

```ts
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

Product --* Category
OrderItem --* Order : "contains"
OrderItem.product --> Product @via((right(OrderItem)+24, cy(OrderItem)), (right(Product)+24, cy(Product))) @line(ortho)
User.orders --> Order : "places"
Payment ..> Order
Admin ..> Category : "curates"

note "price is frozen per order" -> OrderItem
note "catalog is synced nightly from the ERP"

region Catalog @bg(#f0fdf4) { Category Product }
region Orders @bg(#fdf2f8) { Order OrderItem Payment }
```

## Running

```sh
deno run main.ts                                          # render the built-in sample to stdout
deno run --allow-read main.ts diagram.uml > diagram.svg   # render a file
deno run --allow-read --allow-write main.ts diagram.uml -o diagram.svg
deno test                                                 # run the test suite
```

## Syntax

### Blocks

```
class User @bg(#eef) {
    + name: String
    - age: Int
    # greet(other: User): Void
}
```

The first word is the block kind (`class`, `interface`, `enum`, anything).
Members are attributes (`name: Type`) or methods (`name(params): Type`), with
optional visibility: `+` public, `-` private, `#` protected. Attributes render
in the top section of the card, methods below a separator. Types can have one
generic argument (`List<Post>`).

### Relationships

```
Admin --|> User                  inheritance    (hollow triangle)
User --> Post : "writes"         association    (open arrow, optional label)
Item --* Order                   composition    (filled diamond)
Product --o Category             aggregation    (hollow diamond)
Payment ..> Order                dependency     (dashed, open arrow)
```

The marker lands on the right-hand block, matching where the symbol sits in
the text: `A --* B` puts the diamond on `B`, meaning `B` is the whole.

Lines attach to blocks at fixed hubs. Inheritance runs vertically: out of the
child's top center, into the parent's bottom center, so siblings merge into
one junction. Everything else attaches to the block sides — at the row of the
member that carries the relationship when there is one, otherwise at the
header. The carrying member is found two ways:

- explicitly: `User.orders --> Order` anchors the line at the `orders` row
- by inference: a member whose type mentions the other block (including
  generic arguments and method params) anchors the line automatically, on
  either end

### Notes and regions

```
note "admins can edit" -> Admin      sticky note pointing at a block
note "general remark"                free-floating note
region Auth @bg(#eef) { User Admin } colored area around the named blocks
```

A targeted note sits to the right of its target with a dashed connector.
Regions compute their rectangle from the blocks they contain (plus padding),
or take an explicit `@pos(x, y, w, h)`.

### Annotations

Annotations attach to whatever they follow — a block, member, relationship,
note, region, or (at the top of the file) the diagram itself.

| annotation           | on            | effect                                      |
| -------------------- | ------------- | ------------------------------------------- |
| `@pos(x, y)`         | block, note   | manual position (default: vertical stack)   |
| `@pos(x, y, w, h)`   | region        | explicit rectangle                          |
| `@size(w)`           | block         | fixed width (default: fits the text)        |
| `@bg(color)`         | anything      | fill color; on the diagram, page background |
| `@edge(color)`       | block, region | border color                                |
| `@color(color)`      | block         | text color                                  |
| `@line(ortho)`       | relationship  | elbow routing (the default); `straight` for a direct line; diagram-level sets the default |
| `@via((x, y), ...)`  | relationship  | manual corner points for the line           |

Unknown annotations parse fine and are ignored.

### Geometry expressions

Anywhere an annotation takes a number, you can reference the geometry of a
laid-out block and do arithmetic on it:

```
OrderItem.product --> Product @via((right(OrderItem)+24, cy(OrderItem)))
class B @pos(right(A)+40, y(A))
```

Available: `x(B)`, `y(B)`, `width(B)`, `height(B)`, `right(B)`, `bottom(B)`,
`cx(B)`, `cy(B)`, combined with `+ - * /` and parentheses. An expression that
references an unknown block resolves to nothing and the annotation falls back
to its default behavior.
