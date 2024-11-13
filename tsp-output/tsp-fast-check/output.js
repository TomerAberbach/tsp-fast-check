import * as fc from "fast-check";

export const Pets = {
  Toys: {
    Toy: fc.record({
      name: fc.string(),
    }),
  },

  Pet: fc.record({
    breed: fc.oneof(
      fc.record({
        int64: fc.bigInt({
          min: -9223372036854775808n,
          max: 9223372036854775807n,
        }),
        integer: fc.bigInt(),
        decimal: fc.double(),
        url: fc.webUrl(),
        bytes: fc.int8Array(),
        name: fc.string(),
        name2: fc.array(fc.string()),
        age: fc.integer({
          min: -2147483648,
          max: 2147483647,
        }),
        blah: fc.boolean(),
        blah2: fc.float(),
        blah3: fc.double(),
        blah4: fc.dictionary(fc.string(), fc.string()),
      }),
      fc.record({
        name2: fc.string(),
        age: fc.integer({
          min: -2147483648,
          max: 2147483647,
        }),
        age2: fc.integer({
          min: -32768,
          max: 32767,
        }),
      }),
      fc
        .tuple(
          fc.dictionary(fc.string(), fc.string()),
          fc.record({
            name3: fc.string(),
          }),
        )
        .map(([dictionary, record]) => ({ ...dictionary, ...record })),
    ),
    id: fc.integer({
      min: -2147483648,
      max: 2147483647,
    }),
    name: fc.string({
      minLength: 1,
      maxLength: 4,
    }),
    age: fc.integer({
      min: 0,
      max: 100,
    }),
    kind: fc.constantFrom("dog", "cat", "fish", "bird", "reptile"),
  }),

  petType: fc.constantFrom("dog", "cat", "fish", "bird", "reptile"),
};

export const Blah = fc.record({
  name: fc.string(),
});

export const Breed = fc.oneof(
  fc.record({
    int64: fc.bigInt({
      min: -9223372036854775808n,
      max: 9223372036854775807n,
    }),
    integer: fc.bigInt(),
    decimal: fc.double(),
    url: fc.webUrl(),
    bytes: fc.int8Array(),
    name: fc.string(),
    name2: fc.array(fc.string()),
    age: fc.integer({
      min: -2147483648,
      max: 2147483647,
    }),
    blah: fc.boolean(),
    blah2: fc.float(),
    blah3: fc.double(),
    blah4: fc.dictionary(fc.string(), fc.string()),
  }),
  fc.record({
    name2: fc.string(),
    age: fc.integer({
      min: -2147483648,
      max: 2147483647,
    }),
    age2: fc.integer({
      min: -32768,
      max: 32767,
    }),
  }),
  fc
    .tuple(
      fc.dictionary(fc.string(), fc.string()),
      fc.record({
        name3: fc.string(),
      }),
    )
    .map(([dictionary, record]) => ({ ...dictionary, ...record })),
);
