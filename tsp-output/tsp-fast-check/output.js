import * as fc from "fc";

const string = fc.string();

const petType = fc.constantFrom("dog", "cat", "fish", "bird", "reptile");

const int32 = fc.integer({
  min: -2147483648,
  max: 2147483647,
});

const model = fc
  .tuple(
    fc.dictionary(string, string),
    fc.record({
      name3: string,
    }),
  )
  .map(([dictionary, record]) => ({ ...dictionary, ...record }));

const int16 = fc.integer({
  min: -32768,
  max: 32767,
});

const model0 = fc.record({
  name2: string,
  age: int32,
  age2: int16,
});

const Record = fc.dictionary(string, string);

const float64 = fc.double();

const float32 = fc.float();

const boolean = fc.boolean();

const Array = fc.array(string);

const bytes = fc.int8Array();

const url = fc.webUrl();

const decimal = fc.double();

const integer = fc.bigInt();

const int64 = fc.bigInt({
  min: -9223372036854775808n,
  max: 9223372036854775807n,
});

const model1 = fc.record({
  int64: int64,
  integer: integer,
  decimal: decimal,
  url: url,
  bytes: bytes,
  name: string,
  name2: Array,
  age: int32,
  blah: boolean,
  blah2: float32,
  blah3: float64,
  blah4: Record,
});

export const Breed = fc.oneof(model1, model0, model);

export const Pets = {
  Toys: {
    Toy: fc.record({
      name: string,
    }),
  },

  Pet: fc.record({
    breed: Breed,
    id: int32,
    name: string,
    age: int32,
    kind: petType,
  }),

  petType: petType,
};

export const Blah = fc.record({
  name: string,
});
