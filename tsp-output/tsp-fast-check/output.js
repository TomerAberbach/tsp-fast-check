import * as fc from "fc";

export const shared0 = fc.record({
  name: fc.string(),
});

export const shared1 = fc.constantFrom("dog", "cat", "fish", "bird", "reptile");

export const shared2 = fc.oneof(
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

export const shared3 = fc.record({
  breed: shared2,
  id: fc.integer({
    min: -2147483648,
    max: 2147483647,
  }),
  name: fc.string(),
  age: fc.integer({
    min: -2147483648,
    max: 2147483647,
  }),
  kind: shared1,
});

export const shared4 = fc.record({
  name: fc.string(),
});

export const Pets = {
  Toys: {
    Toy: shared4,
  },

  Pet: shared3,

  petType: shared1,
};

export const Blah = shared0;

export const Breed = shared2;
